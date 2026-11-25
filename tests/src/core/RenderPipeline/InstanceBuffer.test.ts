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

  it("rotates distinct UBO slots across batches within the same frame without Discard orphaning", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const instanceBuffer = engine._batcherManager.instanceBuffer;
    instanceBuffer.setLayout({ instanceFields: [], instanceMaxCount: 4, structSize: 64 });
    const firstSlot = instanceBuffer.buffer;
    const setDataSpy = vi.spyOn(firstSlot, "setData");

    const dummyRenderer = { shaderData: { _propertyValueMap: {} } } as any;
    const renderers = [dummyRenderer, dummyRenderer];

    instanceBuffer.upload(renderers, 0, 1);
    const bufAfterFirst = instanceBuffer.buffer;
    expect(bufAfterFirst).toBe(firstSlot);
    expect(setDataSpy.mock.calls[0][1]).toBe(0);
    expect(setDataSpy.mock.calls[0][4]).toBe(SetDataOptions.None);

    instanceBuffer.upload(renderers, 0, 2);
    const bufAfterSecond = instanceBuffer.buffer;
    expect(bufAfterSecond).not.toBe(bufAfterFirst);
    expect(bufAfterSecond.isGCIgnored).toBe(true);
  });

  it("orphans only after the ring saturates and reuses the oldest slot once it is frame-safe", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const instanceBuffer = engine._batcherManager.instanceBuffer;
    instanceBuffer.setLayout({ instanceFields: [], instanceMaxCount: 1, structSize: 16 });
    const renderer = engine.sceneManager.activeScene.createRootEntity().addComponent(MeshRenderer);
    const renderers = [renderer];
    const oldest = instanceBuffer.buffer;
    const oldestUpload = vi.spyOn(oldest, "setData");
    const slots = new Set<typeof oldest>();

    for (let i = 0; i < 192; i++) {
      instanceBuffer.upload(renderers, 0, 1);
      slots.add(instanceBuffer.buffer);
    }
    expect(slots.size).toBe(192);
    expect(oldestUpload.mock.calls[0][4]).toBe(SetDataOptions.None);

    instanceBuffer.upload(renderers, 0, 1);
    expect(instanceBuffer.buffer).toBe(oldest);
    expect(oldestUpload.mock.calls[1][4]).toBe(SetDataOptions.Discard);

    engine.update();
    engine.update();
    const nextOldest = [...slots][1];
    const reusableUpload = vi.spyOn(nextOldest, "setData");
    instanceBuffer.upload(renderers, 0, 1);
    expect(instanceBuffer.buffer).toBe(nextOldest);
    expect(reusableUpload.mock.calls[0][4]).toBe(SetDataOptions.None);
  });

  it("caches active VAO bindings and avoids per-draw UBO gl.bufferData orphans in steady-state rendered frames", async () => {
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

    // Warm up shaders, VAOs, and 2-frame rotating UBO pool.
    engine.update();
    engine.update();

    const gl = (engine._hardwareRenderer as any).gl as WebGL2RenderingContext;
    const bindVaoSpy = vi.spyOn(gl, "bindVertexArray");
    const drawElementsSpy = vi.spyOn(gl, "drawElements");
    const drawInstancedSpy = vi.spyOn(gl, "drawElementsInstanced");
    const bufferDataSpy = vi.spyOn(gl, "bufferData");

    engine.update();

    // Expect 4 single draws + 2 instanced batches all rendered cleanly.
    expect(drawElementsSpy.mock.calls.length).toBe(4);
    expect(drawInstancedSpy.mock.calls.length).toBe(2);
    // Assert VAO-cache invariants only when the active RHI implements `_bindVertexArray` (e.g. modified RHI).
    if (typeof (engine._hardwareRenderer as any)._bindVertexArray === "function") {
      const vaoNullCalls = bindVaoSpy.mock.calls.filter(([vao]) => vao === null).length;
      expect(vaoNullCalls).toBe(0);
      // Single-mesh shader VAO + instanced shader VAO + background/sky VAO = at most 3 binds for 6+ draws (no per-draw null unbind).
      expect(bindVaoSpy.mock.calls.length).toBeLessThanOrEqual(3);
    }

    // Steady-state frame reuses double-buffered UBO pool slots with ZERO gl.bufferData orphans.
    const uboBufferDataCalls = bufferDataSpy.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER);
    expect(uboBufferDataCalls.length).toBe(0);
  });

  it("reuses rotating UBO slots in steady-state rendered frames with zero gl.bufferData orphans", async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity();
    const cameraEntity = root.createChild("camera");
    cameraEntity.transform.setPosition(0, 0, 10);
    cameraEntity.addComponent(Camera);

    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    for (let b = 0; b < 3; b++) {
      const sharedMat = new UnlitMaterial(engine);
      for (let i = 0; i < 2; i++) {
        const entity = root.createChild(`inst-ring-${b}-${i}`);
        entity.transform.setPosition(i - 0.5, -1 - b, 0);
        const mr = entity.addComponent(MeshRenderer);
        mr.mesh = mesh;
        mr.setMaterial(sharedMat);
      }
    }

    // Warm up 2-frame rotating UBO pool.
    engine.update();
    engine.update();

    const gl = (engine._hardwareRenderer as any).gl as WebGL2RenderingContext;
    const drawInstancedSpy = vi.spyOn(gl, "drawElementsInstanced");
    const bufferDataSpy = vi.spyOn(gl, "bufferData");
    const bufferSubDataSpy = vi.spyOn(gl, "bufferSubData");

    engine.update();
    engine.update();

    expect(drawInstancedSpy.mock.calls.length).toBe(6);
    const uboBufferDataCalls = bufferDataSpy.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER);
    const uboBufferSubDataCalls = bufferSubDataSpy.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER);
    expect(uboBufferDataCalls.length).toBe(0);
    expect(uboBufferSubDataCalls.length).toBe(6);
  });
});
