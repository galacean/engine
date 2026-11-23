import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebGPUShaderCompiler } from "@galacean/engine-shader-compiler/webgpu";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Camera,
  CameraClearFlags,
  Color,
  CullMode,
  EngineEventType,
  IndexBufferBinding,
  IndexFormat,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  PrimitiveMesh,
  RenderState,
  RenderTarget,
  RenderBufferLoadAction,
  RenderBufferStoreAction,
  SetDataOptions,
  Texture2D,
  Texture2DArray,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  UnlitMaterial,
  Vector4,
  WebGPUEngine,
  WebGPUGraphicDevice
} from "@galacean/engine-webgpu";

/** These tests exercise real native encoders and read GPU results back through the engine. */
describe.skipIf(!navigator.gpu)("Native WebGPU rendering", () => {
  let canvas: HTMLCanvasElement;
  let engine: WebGPUEngine;
  let rhi: WebGPUGraphicDevice;

  beforeEach(async () => {
    canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    engine = await WebGPUEngine.create({ canvas });
    engine.canvas.setResolution(64, 64);
    rhi = engine._hardwareRenderer as WebGPUGraphicDevice;
    rhi.device.pushErrorScope("validation");
  });

  afterEach(async () => {
    try {
      if (!rhi) return;
      rhi.flush();
      expect((await rhi.device.popErrorScope())?.message).toBeUndefined();
    } finally {
      engine?.destroy();
      canvas.remove();
    }
  });

  async function restoreDevice() {
    expect(await rhi.device.popErrorScope()).toBeNull();
    const lost = new Promise((resolve) => engine.once(EngineEventType.DeviceLost, resolve));
    const restored = new Promise((resolve) => engine.once(EngineEventType.DeviceRestored, resolve));
    const previous = rhi.device;
    engine.forceLoseDevice();
    await lost;
    engine.forceRestoreDevice();
    await restored;
    rhi.device.pushErrorScope("validation");
    expect(rhi.device).not.toBe(previous);
  }

  it("renders a mesh into the expected upper quadrant and preserves it when another camera clears the right half", async () => {
    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("root");
    const camera = root.createChild("camera").addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 4);
    const color = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8_UNorm, false, false);
    const target = (camera.renderTarget = new RenderTarget(engine, 64, 64, color, TextureFormat.Depth24Stencil8));
    const object = root.createChild("red cube");
    object.transform.setPosition(-0.6, 0.6, 0);
    const renderer = object.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new UnlitMaterial(engine);
    material.baseColor.set(1, 0, 0, 1);
    renderer.setMaterial(material);
    scene.background.solidColor.set(0, 0, 1, 1);
    engine.update();
    const before = new Uint8Array(64 * 64 * 4);
    await color.getPixelBufferAsync(before);
    const at = (bytes: Uint8Array, x: number, y: number) =>
      Array.from(bytes.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
    expect(at(before, 18, 18)).toEqual([255, 0, 0, 255]);
    expect(at(before, 18, 46)).toEqual([0, 0, 255, 255]);

    const other = root.createChild("right camera").addComponent(Camera);
    other.renderTarget = target;
    other.viewport.set(0.5, 0, 0.5, 1);
    other.cullingMask = 0;
    scene.background.solidColor.set(0, 1, 0, 1);
    other.render();
    const after = new Uint8Array(before.length);
    await color.getPixelBufferAsync(after);
    for (let y = 0; y < 64; y++) {
      const row = y * 64 * 4;
      expect(after.subarray(row, row + 32 * 4)).toEqual(before.subarray(row, row + 32 * 4));
      expect(at(after, 32, y)).toEqual([0, 255, 0, 255]);
      expect(at(after, 63, y)).toEqual([0, 255, 0, 255]);
    }
  });

  it("preserves physical group numbers and omits unused trailing slots from raster layouts", () => {
    const createLayout = vi.spyOn(rhi.device, "createPipelineLayout");
    try {
      const program = rhi.createPlatformShaderProgram(engine, {
        vertexSource: "@vertex fn main() -> @builtin(position) vec4f { return vec4f(0,0,0,1); }",
        fragmentSource:
          "@group(2) @binding(0) var<uniform> value: vec4f; @fragment fn main() -> @location(0) vec4f { return value; }",
        reflection: {
          vertexInputs: [],
          vertexOutputs: [],
          fragmentOutputs: [0],
          textures: [],
          uniformBlocks: [
            {
              name: "Material",
              bindingName: "Material",
              physicalBinding: 3,
              group: 2,
              binding: 0,
              visibility: GPUShaderStage.FRAGMENT,
              byteLength: 16,
              members: []
            }
          ]
        }
      });
      const groups = Array.from(createLayout.mock.calls[0][0].bindGroupLayouts);
      expect(groups.length).toBe(3);
      expect(groups.slice(0, 2)).toEqual([null, null]);
      expect(groups[2]).toBeTruthy();
      program.destroy();
    } finally {
      createLayout.mockRestore();
    }
  });

  it("records uniform and sampled groups for each bundled draw that uses the slot", async () => {
    const device = rhi.device;
    const format = "rgba8unorm";
    const output = device.createTexture({ size: [1, 1], format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM });
    const module = device.createShaderModule({
      code: `@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
         return vec4f(vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2 - 1, 0, 1);
       }
       @group(0) @binding(0) var<uniform> u: vec4f;
       @group(0) @binding(1) var s: sampler;
       @group(0) @binding(2) var t: texture_2d<f32>;
       @fragment fn solid() -> @location(0) vec4f { return u; }
       @fragment fn sampled() -> @location(0) vec4f { return textureSample(t, s, vec2f(0)); }`
    });
    const pipeline = (entryPoint: string) =>
      device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint, targets: [{ format }] }
      });
    const solid = pipeline("solid"),
      sampled = pipeline("sampled");
    const a = device.createBindGroup({
      layout: solid.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniform } }]
    });
    const texture = device.createTexture({ size: [1, 1], format, usage: GPUTextureUsage.TEXTURE_BINDING });
    const b = device.createBindGroup({
      layout: sampled.getBindGroupLayout(0),
      entries: [
        { binding: 1, resource: device.createSampler() },
        { binding: 2, resource: texture.createView() }
      ]
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: output.createView(), loadOp: "clear", clearValue: [0, 0, 0, 0], storeOp: "store" }]
    });
    const bundles = rhi["_bundles"];
    bundles.begin(pass, output, "alternating groups", [format], undefined, 1, true);
    const offsets = new Uint32Array(0);
    const record = vi.spyOn(bundles, "setBindGroup");
    for (const usesTexture of [false, false, true, true, false]) {
      bundles.beginDraw();
      bundles.setPipeline(usesTexture ? sampled : solid);
      rhi._setBindGroup(bundles, 0, usesTexture ? b : a, offsets);
      bundles.draw(3);
    }
    bundles.end();
    expect(record.mock.calls.map((call) => call[1])).toEqual([a, a, b, b, a]);
    record.mockRestore();
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    uniform.destroy();
    texture.destroy();
    output.destroy();
  });

  it("keeps both draws when an external UInt8 index buffer and a uniform range are overwritten in one frame", async () => {
    const color = new Texture2D(engine, 8, 4, TextureFormat.R8G8B8A8_UNorm, false, false);
    const target = new RenderTarget(engine, 8, 4, color, null);
    const mesh = new ModelMesh(engine);
    const indices = new Buffer(engine, BufferBindFlag.IndexBuffer, new Uint8Array([0, 1, 2]), BufferUsage.Dynamic);
    mesh._primitive.setIndexBufferBinding(new IndexBufferBinding(indices, IndexFormat.UInt8));
    const sub = mesh.addSubMesh(0, 3, MeshTopology.Triangles);
    const program = rhi.createPlatformShaderProgram(engine, {
      vertexSource: `@vertex fn main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
        let p=vec2f(f32((i<<1u)&2u),f32(i&2u)); return vec4f(p*2.0-1.0,0.0,1.0);
      }`,
      fragmentSource:
        "@group(1) @binding(0) var<uniform> color:vec4f; @fragment fn main()->@location(0) vec4f { return color; }",
      reflection: {
        vertexInputs: [],
        vertexOutputs: [],
        fragmentOutputs: [0],
        textures: [],
        uniformBlocks: [
          {
            name: "Camera",
            bindingName: "Camera",
            physicalBinding: 2,
            group: 1,
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            byteLength: 16,
            members: []
          }
        ]
      }
    });
    const state = new RenderState();
    state.rasterState.cullMode = CullMode.Off;
    await program.prewarm!(mesh._primitive, sub, target, state, false);
    rhi.activeRenderTarget(target, new Vector4(0, 0, 1, 1), false);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, new Color(0, 0, 0, 1));
    rhi.applyRenderState(state, state, false);
    const uniform = new Buffer(engine, BufferBindFlag.ConstantBuffer, 256, BufferUsage.Dynamic);
    rhi.bindUniformBufferRange(2, uniform._platformBuffer, 0, 16, new Float32Array([1, 0, 0, 1]));
    rhi.viewport(0, 0, 4, 4);
    rhi.drawPrimitive(mesh._primitive, sub, program);
    indices.setData(new Uint8Array([2, 1, 0]));
    rhi.bindUniformBufferRange(2, uniform._platformBuffer, 0, 16, new Float32Array([0, 0, 1, 1]), true);
    rhi.viewport(4, 0, 4, 4);
    rhi.drawPrimitive(mesh._primitive, sub, program);
    rhi.scissor(3, 1, 2, 2);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, new Color(0, 1, 0, 1));
    const pixels = new Uint8Array(8 * 4 * 4);
    await color.getPixelBufferAsync(pixels);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 8; x++) {
        const offset = (y * 8 + x) * 4;
        const expected =
          (x === 3 || x === 4) && (y === 1 || y === 2) ? [0, 255, 0, 255] : x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255];
        expect(Array.from(pixels.subarray(offset, offset + 4))).toEqual(expected);
      }
    program.destroy();
  });

  it("stores an interrupted multisample pass and resolves and discards on the native pass containing the final draw", async () => {
    const color = new Texture2D(engine, 4, 2, TextureFormat.R8G8B8A8_UNorm, false, false);
    const target = new RenderTarget(engine, 4, 2, color, TextureFormat.Depth24Stencil8, 4);
    const mesh = new ModelMesh(engine),
      sub = mesh.addSubMesh(0, 3, MeshTopology.Triangles);
    const program = rhi.createPlatformShaderProgram(engine, {
      vertexSource:
        "@vertex fn main(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {return vec4f(vec2f(f32((i<<1u)&2u),f32(i&2u))*2.-1.,0.,1.);}",
      fragmentSource:
        "@fragment fn main(@builtin(position) p:vec4f)->@location(0) vec4f {return select(vec4f(0,1,0,1),vec4f(1,0,0,1),p.x<2.);}",
      reflection: { textures: [], uniformBlocks: [], vertexInputs: [], vertexOutputs: [], fragmentOutputs: [0] }
    });
    const native = GPUCommandEncoder.prototype.beginRenderPass;
    const stores: (GPUStoreOp | boolean | undefined)[][] = [];
    const observe = vi.spyOn(GPUCommandEncoder.prototype, "beginRenderPass").mockImplementation(function (
      this: GPUCommandEncoder,
      descriptor
    ) {
      if (descriptor.label === "native store split") {
        const color = Array.from(descriptor.colorAttachments)[0]!;
        stores.push([color.storeOp, !!color.resolveTarget, descriptor.depthStencilAttachment?.depthStoreOp]);
      }
      return native.call(this, descriptor);
    });
    try {
      const state = new RenderState();
      state.rasterState.cullMode = CullMode.Off;
      rhi.applyRenderState(state, state, false);
      rhi.activeRenderTarget(
        target,
        new Vector4(0, 0, 1, 1),
        false,
        0,
        undefined,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.Resolve,
        RenderBufferLoadAction.Load,
        RenderBufferStoreAction.DontCare,
        "native store split"
      );
      rhi.clearRenderTarget(engine, CameraClearFlags.All, new Color(0, 0, 1, 1));
      rhi.viewport(0, 0, 2, 2);
      rhi.drawPrimitive(mesh._primitive, sub, program);
      const pixels = new Uint8Array(4 * 2 * 4);
      await color.getPixelBufferAsync(pixels);
      expect(Array.from(pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
      expect(Array.from(pixels.slice(12, 16))).toEqual([0, 0, 255, 255]);
      rhi.viewport(2, 0, 2, 2);
      rhi.drawPrimitive(mesh._primitive, sub, program);
      target._blitRenderTarget();
      await color.getPixelBufferAsync(pixels);
      expect(Array.from(pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
      expect(Array.from(pixels.slice(12, 16))).toEqual([0, 255, 0, 255]);
      expect(stores).toEqual([
        ["store", true, "store"],
        ["discard", true, "discard"]
      ]);
    } finally {
      observe.mockRestore();
      program.destroy();
    }
  });

  it("recycles submitted Discard backings while preserving earlier copies and clearing untouched bytes", async () => {
    const input = new Buffer(engine, BufferBindFlag.VertexBuffer, 8, BufferUsage.Dynamic);
    const snapshots = new Buffer(engine, BufferBindFlag.VertexBuffer, 16, BufferUsage.Dynamic);
    const allocations = vi.spyOn(rhi.device, "createBuffer");
    try {
      for (let frame = 0; frame < 3; frame++) {
        input.setData(new Uint8Array(8).fill(frame + 1));
        snapshots.copyFromBuffer(input, 0, 0, 8);
        input.setData(new Uint8Array([20 + frame]), 3, 0, 1, SetDataOptions.Discard);
        snapshots.copyFromBuffer(input, 0, 8, 8);
        if (frame) expect(allocations).not.toHaveBeenCalled();
        const result = new Uint8Array(16);
        await snapshots.getDataAsync(result);
        expect(Array.from(result)).toEqual([...Array(8).fill(frame + 1), 0, 0, 0, 20 + frame, 0, 0, 0, 0]);
        allocations.mockClear();
      }
    } finally {
      allocations.mockRestore();
    }
  });

  it("preserves active instance records through a long submission and recycles the retained pages", async () => {
    const alignment = rhi.uniformBufferOffsetAlignment;
    const input = new Buffer(engine, BufferBindFlag.ConstantBuffer, 4 * alignment, BufferUsage.Dynamic);
    const snapshots = new Buffer(engine, BufferBindFlag.VertexBuffer, 4 * 210, BufferUsage.Dynamic);
    const source = new Float32Array(1);
    const allocations = vi.spyOn(rhi.device, "createBuffer");
    try {
      // Three active prefixes fit per backing while the full two-alignment shader block remains bindable.
      // The long submission grows past the 64 spare limit. Both following submissions fit in the retained pool.
      for (const count of [210, 192, 192]) {
        allocations.mockClear();
        for (let i = 0; i < count; i++) {
          source[0] = count + i;
          const offset = input._platformBuffer.writeInstanceData!(source, 1, 2 * alignment);
          expect(offset).toBe((i % 3) * alignment);
          snapshots.copyFromBuffer(input, offset, i * 4, 4);
        }
        expect(allocations.mock.calls.length).toBe(count === 210 ? 69 : 0);
        const actual = new Float32Array(count);
        await snapshots.getDataAsync(actual);
        expect(Array.from(actual)).toEqual(Array.from({ length: count }, (_, i) => count + i));
      }
    } finally {
      allocations.mockRestore();
      input.destroy();
      snapshots.destroy();
    }
  });

  it("rebuilds live mesh, render target and shader resources after device loss", async () => {
    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity();
    const camera = root.createChild().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 3);
    const texture = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    camera.renderTarget = new RenderTarget(engine, 16, 16, texture, TextureFormat.Depth24Stencil8);
    const renderer = root.createChild().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new UnlitMaterial(engine);
    material.baseColor.set(1, 0, 0, 1);
    renderer.setMaterial(material);
    const second = root.createChild().addComponent(MeshRenderer);
    second.mesh = renderer.mesh;
    second.setMaterial(material);
    second.entity.transform.setPosition(0.8, 0, 0);
    camera.render();
    const instances = engine._batcherManager.instanceBuffer.buffer;
    const firstInstanceBuffer = instances._platformBuffer;
    const pixels = new Uint8Array(16 * 16 * 4);
    await texture.getPixelBufferAsync(pixels);
    expect(Array.from(pixels.slice(544, 548))).toEqual([255, 0, 0, 255]);
    await restoreDevice();
    material.baseColor.set(0, 1, 0, 1);
    camera.render();
    expect(instances._platformBuffer).not.toBe(firstInstanceBuffer);
    await texture.getPixelBufferAsync(pixels);
    expect(Array.from(pixels.slice(544, 548))).toEqual([0, 255, 0, 255]);
  });

  it("preserves GPU-produced neighboring bytes and copies only the requested array layer and cube face", async () => {
    const storage = new Buffer(engine, BufferBindFlag.StorageBuffer, 16, BufferUsage.Dynamic);
    rhi.dispatchCompute(
      `@group(0) @binding(0) var<storage,read_write> data:array<u32>;
      @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) i:vec3u){data[i.x]=0x11223344u;}`,
      "main",
      [4, 1, 1],
      [{ binding: 0, buffer: storage._platformBuffer, access: "read_write" }]
    );
    storage.setData(new Uint8Array([0xaa, 0xbb]), 1);
    const bytes = new Uint8Array(8);
    await storage.getDataAsync(bytes);
    expect(Array.from(bytes)).toEqual([0x44, 0xaa, 0xbb, 0x11, 0x44, 0x33, 0x22, 0x11]);
    const layer = new Texture2DArray(engine, 3, 3, 2, TextureFormat.R8G8B8A8_UNorm, false, false);
    const cube = new TextureCube(engine, 3, TextureFormat.R8G8B8A8_UNorm, false, false);
    const data = Uint8Array.from({ length: 3 * 3 * 4 }, (_, i) => i);
    layer.setPixelBuffer(1, data, 0, 0, 0, 3, 3, 1);
    cube.setPixelBuffer(TextureCubeFace.PositiveX, data);
    const out = new Uint8Array(16);
    for (const read of [
      () => layer.getPixelBufferAsync(1, 1, 1, 2, 2, out),
      () => cube.getPixelBufferAsync(TextureCubeFace.PositiveX, 1, 1, 2, 2, out)
    ]) {
      await read();
      expect(Array.from(out)).toEqual([...data.slice(16, 24), ...data.slice(28, 36)]);
      out.fill(0);
    }
  });

  it("round trips packed colors, floats and compressed blocks across cubemap faces, array layers and mips", async () => {
    const formats = [
      [
        TextureFormat.R8G8B8_UNorm,
        new Uint8Array([0, 1, 2, 5, 8, 13, 21, 34, 55, 89, 144, 233]),
        new Uint8Array([0, 1, 2, 255, 5, 8, 13, 255, 21, 34, 55, 255, 89, 144, 233, 255])
      ],
      [TextureFormat.R5G6B5_UNorm, new Uint16Array([0xf81f, 0x07e0, 0x7813, 0x1234])],
      [TextureFormat.R5G5B5A1_UNorm, new Uint16Array([0xffff, 0x8001, 0x6ea4, 0x4120])],
      [TextureFormat.R4G4B4A4_UNorm, new Uint16Array([0x0fd1, 0x4a6e, 0x0246, 0xac1f])],
      [
        TextureFormat.R16G16_SFloat,
        new Uint16Array([0x0000, 0x3400, 0x3800, 0x3c00, 0x4000, 0x4400, 0xbc00, 0xb800]),
        new Float32Array([0, 0.25, 0, 1, 0.5, 1, 0, 1, 2, 4, 0, 1, -1, -0.5, 0, 1])
      ],
      [
        TextureFormat.R32_SFloat,
        new Float32Array([0, 0.125, 1, -1.5]),
        new Float32Array([0, 0, 0, 1, 0.125, 0, 0, 1, 1, 0, 0, 1, -1.5, 0, 0, 1])
      ],
      [
        TextureFormat.R11G11B10_UFloat,
        new Float32Array([1, 2, 4, 0.5, 0.25, 0.125, 0, 0.75, 1.5, 8, 16, 32]),
        new Float32Array([1, 2, 4, 1, 0.5, 0.25, 0.125, 1, 0, 0.75, 1.5, 1, 8, 16, 32, 1])
      ],
      [
        TextureFormat.R16_UNorm,
        new Uint16Array([0, 12345, 40960, 65535]),
        new Uint16Array([0, 0, 0, 65535, 12345, 0, 0, 65535, 40960, 0, 0, 65535, 65535, 0, 0, 65535])
      ]
    ] as const;
    for (const [format, data, expectedData = data] of formats) {
      if (format === TextureFormat.R16_UNorm && !rhi.device.features.has("texture-formats-tier1")) {
        expect(rhi.supportsTextureFormat(format)).toBe(false);
        continue;
      }
      const cube = new TextureCube(engine, 4, format, true, false);
      const array = new Texture2DArray(engine, 4, 4, 3, format, true, false);
      cube.setPixelBuffer(TextureCubeFace.NegativeZ, data, 1);
      array.setPixelBuffer(2, data, 1, 0, 0, 2, 2, 1);
      const out = new Uint8Array(expectedData.byteLength);
      const expected = new Uint8Array(expectedData.buffer, expectedData.byteOffset, expectedData.byteLength);
      await cube.getPixelBufferAsync(TextureCubeFace.NegativeZ, 1, out);
      expect(out).toEqual(expected);
      out.fill(0);
      await array.getPixelBufferAsync(2, 1, out);
      expect(out).toEqual(expected);
      await cube.makePixelBufferReadable(1, TextureCubeFace.NegativeZ);
      const lastPixel = new Uint8Array(out.byteLength / 4);
      cube.getPixelBuffer(TextureCubeFace.NegativeZ, 1, 1, 1, 1, 1, lastPixel);
      expect(lastPixel).toEqual(expected.slice(expected.length - lastPixel.length));
      cube.destroy();
      array.destroy();
    }
    const bc = rhi.device.features.has("texture-compression-bc");
    const etc = rhi.device.features.has("texture-compression-etc2");
    const astc = rhi.device.features.has("texture-compression-astc");
    if (bc || etc || astc) {
      const format = bc ? TextureFormat.BC1 : etc ? TextureFormat.ETC2_RGB : TextureFormat.ASTC_4x4;
      const bytes = Uint8Array.from({ length: format === TextureFormat.ASTC_4x4 ? 16 : 8 }, (_, i) => 7 + i);
      const compressed = new Texture2D(engine, 8, 8, format, true, false);
      compressed.setPixelBuffer(bytes, 2, 0, 0, 2, 2);
      const out = new Uint8Array(bytes.length);
      await compressed.getPixelBufferAsync(2, out);
      expect(out).toEqual(bytes);
    }
  });

  it("orders overlapping partial buffer writes before and after device restoration", async () => {
    async function checkPartialWrites() {
      const values = new Uint32Array([1, 2, 3, 4, 5]);
      const source = new Buffer(engine, BufferBindFlag.VertexBuffer, values, BufferUsage.Dynamic);
      const captures = new Buffer(engine, BufferBindFlag.VertexBuffer, 12);
      source._rememberVertexSource(values);
      expect(source._getVertexSource()).toEqual(new Uint8Array(values.buffer));
      rhi.flush();
      const submit = vi.spyOn(rhi.device.queue, "submit");
      try {
        captures.copyFromBuffer(source, 0, 0, 4);
        source.setData(new Uint32Array([6, 7, 8]), 0);
        expect(source._getVertexSource()).toBeNull();
        source.setData(new Uint32Array([10, 11]), 8);
        captures.copyFromBuffer(source, 8, 4, 8);
        expect(submit).not.toHaveBeenCalled();
        const out = new Uint32Array(3);
        await captures.getDataAsync(out);
        expect(Array.from(out)).toEqual([1, 10, 11]);
        expect(submit).toHaveBeenCalledTimes(1);
        source._rememberVertexSource(values);
        source.copyFromBuffer(captures, 0, 0, 4);
        expect(source._getVertexSource()).toBeNull();
      } finally {
        submit.mockRestore();
        captures.destroy();
        source.destroy();
      }
    }

    await checkPartialWrites();
    await restoreDevice();
    await checkPartialWrites();
  });

  it("generates the rendered mip chain in order on the frame encoder", async () => {
    const texture = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, true, false);
    const target = new RenderTarget(engine, 4, 4, texture, null);
    target.autoGenerateMipmaps = false;
    rhi.flush();
    const submit = vi.spyOn(rhi.device.queue, "submit");
    try {
      rhi.activeRenderTarget(target, new Vector4(0, 0, 1, 1), false);
      rhi.clearRenderTarget(engine, CameraClearFlags.Color, new Color(1, 0, 0, 1));
      rhi.endRenderPass();
      texture.generateMipmaps();
      expect(submit).not.toHaveBeenCalled();
      const texel = new Uint8Array(4);
      await texture.getPixelBufferAsync(2, texel);
      expect(Array.from(texel)).toEqual([255, 0, 0, 255]);
      expect(submit).toHaveBeenCalledTimes(1);
    } finally {
      submit.mockRestore();
    }
  });

  it("generates the advertised narrow float mip chain and reads RGBA float pixels", async () => {
    for (const format of [TextureFormat.R16_SFloat, TextureFormat.R32_SFloat]) {
      if (!rhi.supportsGenerateMipmaps(format, false)) continue;
      const texture = new Texture2D(engine, 2, 2, format, true, false);
      texture.setPixelBuffer(
        format === TextureFormat.R16_SFloat ? new Uint16Array([0, 0, 0x3c00, 0x3c00]) : new Float32Array([0, 0, 1, 1])
      );
      texture.generateMipmaps();
      const output = new Float32Array(4);
      await texture.getPixelBufferAsync(1, output);
      expect(Array.from(output)).toEqual([0.5, 0, 0, 1]);
    }
  });

  it("reuses stable render bundles and changes a later draw's dynamic offset without replaying stale state", async () => {
    const output = new Texture2D(engine, 8, 4, TextureFormat.R8G8B8A8_UNorm, false, false);
    const target = new RenderTarget(engine, 8, 4, output, null);
    const mesh = new ModelMesh(engine);
    const sub = mesh.addSubMesh(0, 3, MeshTopology.Triangles);
    const program = rhi.createPlatformShaderProgram(engine, {
      vertexSource: `@vertex fn main(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
        return vec4f(vec2f(f32((i<<1u)&2u),f32(i&2u))*2.0-1.0,0.0,1.0); }`,
      fragmentSource:
        "@group(0) @binding(0) var<uniform> color:vec4f; @fragment fn main()->@location(0) vec4f{return color;}",
      reflection: {
        vertexInputs: [],
        vertexOutputs: [],
        textures: [],
        fragmentOutputs: [0],
        uniformBlocks: [
          {
            name: "Scene",
            bindingName: "Scene",
            physicalBinding: 1,
            group: 0,
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            byteLength: 16,
            members: []
          }
        ]
      }
    });
    const stride = rhi.uniformBufferOffsetAlignment;
    const buffer = rhi.createPlatformBuffer(BufferBindFlag.ConstantBuffer, stride + 16, BufferUsage.Dynamic);
    buffer.setData(stride + 16, new Float32Array([1, 0, 0, 1]));
    buffer.setData(stride + 16, new Float32Array([0, 0, 1, 1]), stride);
    const state = new RenderState();
    state.rasterState.cullMode = CullMode.Off;
    const encode = vi.spyOn(GPUDevice.prototype, "createRenderBundleEncoder");
    const replay = vi.spyOn(GPURenderPassEncoder.prototype, "executeBundles");
    const bytes = new Uint8Array(8 * 4 * 4);
    try {
      for (let frame = 0; frame < 4; frame++) {
        rhi.activeRenderTarget(target, new Vector4(0, 0, 1, 1), false);
        rhi.clearRenderTarget(engine, CameraClearFlags.Color, new Color(0, 0, 0, 1));
        rhi.applyRenderState(state, state, false);
        rhi.bindUniformBufferRange(1, buffer, 0, 16);
        for (let i = 0; i < 164; i++) {
          if (i === 129) {
            rhi.scissor(4, 0, 4, 4);
            if (frame === 3) rhi.bindUniformBufferRange(1, buffer, stride, 16);
          }
          rhi.drawPrimitive(mesh._primitive, sub, program);
        }
        await output.getPixelBufferAsync(bytes);
        expect(Array.from(bytes.slice(0, 4))).toEqual([255, 0, 0, 255]);
        expect(Array.from(bytes.slice(28, 32))).toEqual(frame === 3 ? [0, 0, 255, 255] : [255, 0, 0, 255]);
        if (frame === 2) {
          expect(encode).not.toHaveBeenCalled();
          expect(replay).toHaveBeenCalled();
        }
        encode.mockClear();
        replay.mockClear();
      }
    } finally {
      encode.mockRestore();
      replay.mockRestore();
      program.destroy();
    }
  });

  it("binds a physical texture array and refreshes the exact sources after CPU uploads and render-target writes", async () => {
    const makeTexture = () => new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, true, false);
    const a = makeTexture(),
      b = makeTexture(),
      output = makeTexture();
    const target = new RenderTarget(engine, 4, 4, output, null),
      sourceTarget = new RenderTarget(engine, 4, 4, b, null);
    const solid = (r: number, g: number, b: number) =>
      new Uint8Array([r, g, b, 255, r, g, b, 255, r, g, b, 255, r, g, b, 255]);
    a.setPixelBuffer(solid(255, 0, 0), 1);
    b.setPixelBuffer(solid(0, 255, 0), 1);
    const mesh = new ModelMesh(engine),
      sub = mesh.addSubMesh(0, 3, MeshTopology.Triangles);
    const program = rhi.createPlatformShaderProgram(engine, {
      vertexSource: `@vertex fn main(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
        return vec4f(vec2f(f32((i<<1u)&2u),f32(i&2u))*2.0-1.0,0.0,1.0); }`,
      fragmentSource: `@group(2) @binding(0) var maps:texture_2d_array<f32>;
        @fragment fn main(@builtin(position) p:vec4f)->@location(0) vec4f {
          return textureLoad(maps,vec2i(0,0),select(0,1,p.x>=2.0),1); }`,
      reflection: {
        uniformBlocks: [],
        vertexInputs: [],
        vertexOutputs: [],
        fragmentOutputs: [0],
        textures: ["a", "b"].map((name, arrayLayer) => ({
          name,
          arrayLayer,
          group: 2,
          textureBinding: 0,
          visibility: 2,
          sampleType: "float",
          viewDimension: "2d-array"
        }))
      }
    });
    program.uniforms[0].apply(a);
    program.uniforms[1].apply(b);
    const state = new RenderState(),
      viewport = new Vector4(0, 0, 1, 1),
      pixels = new Uint8Array(64);
    state.rasterState.cullMode = CullMode.Off;
    for (let step = 0; step < 3; step++) {
      if (step === 1) a.setPixelBuffer(solid(0, 0, 255), 1);
      if (step === 2) {
        rhi.activeRenderTarget(sourceTarget, viewport, false, 1);
        rhi.clearRenderTarget(engine, CameraClearFlags.Color, new Color(1, 0, 1, 1));
      }
      rhi.activeRenderTarget(target, viewport, false);
      rhi.applyRenderState(state, state, false);
      rhi.drawPrimitive(mesh._primitive, sub, program);
      await output.getPixelBufferAsync(pixels);
      expect(Array.from(pixels.slice(0, 4))).toEqual(step ? [0, 0, 255, 255] : [255, 0, 0, 255]);
      expect(Array.from(pixels.slice(12, 16))).toEqual(step === 2 ? [255, 0, 255, 255] : [0, 255, 0, 255]);
    }
    program.destroy();
  });

  it("packs power-of-two scaled material textures without changing native filtering, mip lookup or dimensions", async () => {
    const compiler = await createWebGPUShaderCompiler();
    const properties = ["material_large", "material_small", "material_single"];
    const textures = [16, 4, 8].map((w, i) => {
      const formats = [TextureFormat.R8G8B8A8_UNorm, TextureFormat.R8G8_UNorm, TextureFormat.R8_UNorm];
      const channels = [4, 2, 1][i];
      const texture = new Texture2D(engine, w, w / 2, formats[i], i !== 2, false);
      texture.filterMode = TextureFilterMode.Trilinear;
      texture.wrapModeU = TextureWrapMode.Repeat;
      texture.wrapModeV = TextureWrapMode.Mirror;
      texture.anisoLevel = 1;
      for (let m = 0; m < texture.mipmapCount; m++) {
        const width = Math.max(1, w >> m),
          height = Math.max(1, (w / 2) >> m);
        const data = new Uint8Array(width * height * channels);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++)
            data.set(
              [(m * 59 + x * 37) % 256, (i * 71 + y * 63) % 256, (x * 33 + y * 43) % 256, 255].slice(0, channels),
              (y * width + x) * channels
            );
        texture.setPixelBuffer(data, m);
      }
      return texture;
    });
    const options = {
      textureKeys: Object.fromEntries(properties.map((n) => [n, n])),
      textureArrayKeys: Object.fromEntries(properties.map((n, i) => [n, rhi.getTextureArrayKey(textures[i])!])),
      textureExtents: Object.fromEntries(
        properties.map((name, i) => [
          name,
          {
            width: textures[i].width,
            height: textures[i].height,
            mipCount: textures[i].mipmapCount,
            format: "rgba8unorm"
          }
        ])
      )
    };
    const vertex =
      "void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0.0,1.0);}";
    const fragment = `uniform sampler2D material_large; uniform sampler2D material_small; uniform sampler2D material_single;
      out vec4 color;
      vec4 fetch(sampler2D t,vec2 uv){
        vec4 implicitSample=texture(t,uv);
        vec4 grad=textureGrad(t,uv,vec2(0.04,0.11),vec2(0.21,0.01));
        vec4 bias=texture(t,uv,0.75);
        vec4 explicitSample=textureLod(t,uv,0.75);
        return (implicitSample+grad+bias+explicitSample)*0.25;
      }
      void main(){vec2 uv=gl_FragCoord.xy*vec2(0.145,-0.115);
        vec4 sampled=(fetch(material_large,uv)+fetch(material_small,uv)+fetch(material_single,uv))/3.;
        vec4 loaded=texelFetch(material_small,ivec2(1,0),1);
        color=vec4(sampled.rg,(loaded.r+float(textureSize(material_small,0).x)/8.)*0.5,1.);
      }`;
    const width = 16,
      height = 16;
    const output = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8_UNorm, false, false);
    const target = new RenderTarget(engine, width, height, output, null);
    const mesh = new ModelMesh(engine),
      sub = mesh.addSubMesh(0, 3, MeshTopology.Triangles);
    const state = new RenderState();
    // Devices can choose a different anisotropic footprint when the physical base size changes.
    textures[1].anisoLevel = 4;
    expect(rhi.getTextureArrayKey(textures[1])).not.toEqual(rhi.getTextureArrayKey(textures[0]));
    textures[1].anisoLevel = 1;
    state.rasterState.cullMode = CullMode.Off;
    let reference: Uint8Array | undefined;
    for (const limit of [16, 1]) {
      const compiled = compiler.compileWebGPUVariant(vertex, fragment, { ...options, maxTexturesPerStage: limit });
      if (limit === 1) expect(compiled.reflection.textures.map((t) => t.arrayMipOffset ?? 0)).toEqual([0, 2, 1]);
      const program = rhi.createPlatformShaderProgram(engine, {
        vertexSource: compiled.vertex,
        fragmentSource: compiled.fragment,
        reflection: compiled.reflection
      });
      for (const u of program.uniforms) u.apply(textures[properties.indexOf(u.name)]);
      rhi.activeRenderTarget(target, new Vector4(0, 0, 1, 1), false);
      rhi.applyRenderState(state, state, false);
      rhi.drawPrimitive(mesh._primitive, sub, program);
      const actual = new Uint8Array(width * height * 4);
      await output.getPixelBufferAsync(actual);
      if (reference) expect(actual).toEqual(reference);
      else {
        expect(new Set(actual).size).toBeGreaterThan(10);
        reference = actual;
      }
      program.destroy();
    }
  });

  it("uploads and reads packed depth and stencil in a cubemap subregion without changing neighboring stencil bits", async () => {
    const texture = new TextureCube(engine, 8, TextureFormat.Depth24Stencil8, true, false);
    const face = TextureCubeFace.PositiveY;
    const original = new Uint32Array(16).fill(0xffffff81);
    texture.setPixelBuffer(face, original, 1);
    texture.setPixelBuffer(face, new Uint32Array([0x80000024, 0x00000040]), 1, 1, 2, 2, 1);
    const pixels = new Uint32Array(16);
    await texture.getPixelBufferAsync(face, 1, pixels);
    expect(Array.from(pixels)).toEqual(
      Array.from(original, (p, i) => (i === 9 ? 0x80000024 : i === 10 ? 0x00000040 : p))
    );
    await texture.makePixelBufferReadable(1, face);
    const region = new Uint32Array(2);
    texture.getPixelBuffer(face, 1, 2, 2, 1, 1, region);
    expect(Array.from(region)).toEqual([0x80000024, 0x00000040]);
  });

  it("resolves MSAA color and sampled depth into the selected cubemap face and mip", async () => {
    const color = new TextureCube(engine, 8, TextureFormat.R8G8B8A8_UNorm, true, false);
    const depth = new TextureCube(engine, 8, TextureFormat.Depth32, true, false);
    const target = new RenderTarget(engine, 8, 8, color, depth, 4);
    target.autoGenerateMipmaps = false;
    rhi.activeRenderTarget(target, new Vector4(0, 0, 1, 1), false, 1, TextureCubeFace.PositiveX);
    rhi.clearRenderTarget(engine, CameraClearFlags.All, new Color(0, 1, 1, 1));
    target._blitRenderTarget();
    const pixels = new Uint8Array(4 * 4 * 4),
      z = new Float32Array(16);
    await color.getPixelBufferAsync(TextureCubeFace.PositiveX, 1, pixels);
    expect(Array.from(pixels.slice(0, 4))).toEqual([0, 255, 255, 255]);
    await color.getPixelBufferAsync(TextureCubeFace.NegativeX, 1, pixels);
    expect(pixels.every((value) => value === 0)).toBe(true);
    await depth.getPixelBufferAsync(TextureCubeFace.PositiveX, 1, z);
    expect(z.every((value) => value === 1)).toBe(true);
  });
});
