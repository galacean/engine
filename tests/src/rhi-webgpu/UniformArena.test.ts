import { expect, it, vi } from "vitest";
import { Buffer, BufferBindFlag, Shader, WebGPUEngine, WebGPUGraphicDevice } from "@galacean/engine-webgpu";

it.skipIf(!navigator.gpu)("reuses uniform arena pages without clearing or copying the unused slots", async () => {
  const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
  const rhi = engine._hardwareRenderer as WebGPUGraphicDevice;
  const device = rhi.device;
  const count = 40,
    submissions = 3;
  const read = device.createBuffer({
    size: 4 * count * submissions,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });
  const copy = vi.spyOn(rhi, "_writeBufferInOrder");
  const clear = vi.spyOn(GPUCommandEncoder.prototype, "clearBuffer");
  device.pushErrorScope("validation");
  try {
    const data = engine.sceneManager.activeScene.shaderData;
    const shader = Shader.create(`Shader "Test/UniformArena" { SubShader "s" { Pass "forward" {
      uniform Scene { vec4 scene_ArenaRecords[64]; };
      VertexShader = vert; FragmentShader = frag;
      void vert() {gl_Position=vec4(0.);}
      void frag() {gl_FragColor=scene_ArenaRecords[0];}
    } } }`);
    const program = shader.subShaders[0].passes[0]._getShaderProgram(engine, data._macroCollection);
    const records = new Float32Array(64 * 4);
    for (let frame = 0; frame < submissions; frame++) {
      for (let i = 0; i < count; i++) {
        const draw = frame * count + i;
        records[0] = draw + 1;
        data.setFloatArray("scene_ArenaRecords", records);
        program.bindUniformBlocks(data, data);
        const { buffer, offset, size } = rhi.uniformRanges[1];
        // Record a consumer of this draw's exact physical range. Later queue writes
        // must preserve it until the command buffer is actually submitted.
        buffer._markUsed(offset, size);
        rhi._getCommandEncoder().copyBufferToBuffer(buffer._gpuBuffer, offset, read, draw * 4, 4);
      }
      rhi.flush();
    }
    await read.mapAsync(GPUMapMode.READ);
    expect([...new Float32Array(read.getMappedRange())]).toEqual(
      Array.from({ length: count * submissions }, (_, i) => i + 1)
    );
    read.unmap();
    expect(copy).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();

    // A public partial discard still zeroes the unbound bytes of an initialized buffer.
    const external = new Buffer(engine, BufferBindFlag.ConstantBuffer, new Uint32Array(8).fill(7));
    rhi.bindUniformBufferRange(1, external._platformBuffer, 0, 16, new Uint32Array([1, 2, 3, 4]), true);
    const actual = new Uint32Array(8);
    await external.getDataAsync(actual);
    expect([...actual]).toEqual([1, 2, 3, 4, 0, 0, 0, 0]);
    external.destroy();
    expect((await device.popErrorScope())?.message).toBeUndefined();
  } finally {
    copy.mockRestore();
    clear.mockRestore();
    read.destroy();
    engine.destroy();
  }
});
