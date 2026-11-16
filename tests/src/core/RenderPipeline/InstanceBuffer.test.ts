import { SetDataOptions, WebGLEngine } from "@galacean/engine";
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
});
