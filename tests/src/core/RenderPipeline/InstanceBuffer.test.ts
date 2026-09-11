import { WebGLEngine } from "@galacean/engine";
import { afterEach, describe, expect, it } from "vitest";

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
});
