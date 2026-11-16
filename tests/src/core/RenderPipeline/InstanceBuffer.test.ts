import { Camera, MeshRenderer, PrimitiveMesh, SetDataOptions, UnlitMaterial, WebGLEngine } from "@galacean/engine";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("InstanceBuffer", () => {
  let engine: WebGLEngine | undefined;

  afterEach(() => {
    engine?.destroy();
    engine = undefined;
  });

  it("keeps its engine-owned buffer alive across resource-manager garbage collection", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const instanceBuffer = engine._batcherManager.instanceBuffer;
    instanceBuffer.setLayout({ instanceFields: [], instanceMaxCount: 1, structSize: 16 });
    const buffer = instanceBuffer.buffer;

    engine.resourceManager.gc();

    expect(buffer.destroyed).toBe(false);

    engine._batcherManager.destroy();
    expect(buffer.destroyed).toBe(true);
  });

  it("sub-allocates aligned UBO slices and orphans only when wrapping to offset 0", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const instanceBuffer = engine._batcherManager.instanceBuffer;
    instanceBuffer.setLayout({ instanceFields: [], instanceMaxCount: 4, structSize: 64 });
    const buffer = instanceBuffer.buffer;
    const setDataSpy = vi.spyOn(buffer, "setData");

    const dummyRenderer = { shaderData: { _propertyValueMap: {} } } as any;
    const renderers = [dummyRenderer, dummyRenderer];

    const offset0 = instanceBuffer.upload(renderers, 0, 1);
    const offset1 = instanceBuffer.upload(renderers, 0, 2);
    expect(offset0).toBe(0);
    expect(offset1).toBeGreaterThan(0);
    expect(setDataSpy.mock.calls[0][1]).toBe(0);
    expect(setDataSpy.mock.calls[0][4]).toBe(SetDataOptions.Discard);
    expect(setDataSpy.mock.calls[1][1]).toBe(offset1);
    expect(setDataSpy.mock.calls[1][4]).toBe(SetDataOptions.None);

    // Exhaust the ring buffer to force wrap-around back to offset 0.
    const maxSteps = Math.ceil(buffer.byteLength / Math.max(16, offset1)) + 4;
    let wrappedOffset = offset1;
    for (let i = 0; i < maxSteps; i++) {
      wrappedOffset = instanceBuffer.upload(renderers, 0, 1);
      if (wrappedOffset === 0) break;
    }
    expect(wrappedOffset).toBe(0);
    const lastCall = setDataSpy.mock.calls[setDataSpy.mock.calls.length - 1];
    expect(lastCall[1]).toBe(0);
    expect(lastCall[4]).toBe(SetDataOptions.Discard);
  });

  it("caches active VAO bindings and binds UBO ring offsets via bindBufferRange in rendered frames", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity();
    const cameraEntity = root.createChild("camera");
    cameraEntity.transform.setPosition(0, 0, 10);
    cameraEntity.addComponent(Camera);

    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    // 4 non-instanced renderers sharing the same mesh & Unlit shader (same VAO).
    for (let i = 0; i < 4; i++) {
      const entity = root.createChild(`single-${i}`);
      entity.transform.setPosition(i - 1.5, 1, 0);
      const mr = entity.addComponent(MeshRenderer);
      mr.mesh = mesh;
      mr.setMaterial(new UnlitMaterial(engine));
    }
    // 2 instanced batches (2 renderers per shared material).
    for (let b = 0; b < 2; b++) {
      const sharedMat = new UnlitMaterial(engine);
      for (let i = 0; i < 2; i++) {
        const entity = root.createChild(`inst-${b}-${i}`);
        entity.transform.setPosition(i - 0.5, -1 - b, 0);
        const mr = entity.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.setMaterial(sharedMat);
      }
    }

    // Warm up shaders, VAOs, and initial ring buffer allocation.
    engine.update();

    const gl = (engine._hardwareRenderer as any).gl as WebGL2RenderingContext;
    const bindVaoSpy = vi.spyOn(gl, "bindVertexArray");
    const drawElementsSpy = vi.spyOn(gl, "drawElements");
    const drawInstancedSpy = vi.spyOn(gl, "drawElementsInstanced");
    const bindRangeSpy = vi.spyOn(gl, "bindBufferRange");
    const bufferDataSpy = vi.spyOn(gl, "bufferData");

    engine.update();

    // Expect 4 single draws + 2 instanced batches all sharing one VAO without null teardown per draw.
    expect(drawElementsSpy.mock.calls.length).toBe(4);
    expect(drawInstancedSpy.mock.calls.length).toBe(2);
    const vaoNullCalls = bindVaoSpy.mock.calls.filter(([vao]) => vao === null).length;
    expect(vaoNullCalls).toBe(0);
    // Single-mesh shader VAO + instanced shader VAO + background/sky VAO = at most 3 binds for 6+ draws (no per-draw null unbind).
    expect(bindVaoSpy.mock.calls.length).toBeLessThanOrEqual(3);

    // Expect bindBufferRange with distinct ascending offsets and zero UBO gl.bufferData reallocations.
    const uboRangeCalls = bindRangeSpy.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER);
    expect(uboRangeCalls.length).toBe(2);
    expect(uboRangeCalls[1][3]).toBeGreaterThan(uboRangeCalls[0][3]);
    const uboBufferDataCalls = bufferDataSpy.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER);
    expect(uboBufferDataCalls.length).toBe(0);
  });
});
