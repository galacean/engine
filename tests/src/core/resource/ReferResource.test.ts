import { Texture2D } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

describe("ReferResource", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine.run();
  });

  it("pending destroy should still destroy even if refCount increases during delay", () => {
    const texture = new Texture2D(engine, 1, 1);

    // @ts-ignore
    engine._frameInProcess = true;
    texture.destroy();
    // @ts-ignore
    engine._frameInProcess = false;

    expect(texture.pendingDestroy).eq(true);

    // During pending period, refCount increases (someone references it again)
    // @ts-ignore
    texture._addReferCount(1);
    expect(texture.refCount).eq(1);

    // End-of-frame: should still destroy (destroy decision is final)
    // @ts-ignore
    engine._processPendingDestroyObjects();

    expect(texture.destroyed).eq(true);
  });

  it("pending force destroy should not fail due to lost force flag at end of frame", () => {
    const texture = new Texture2D(engine, 1, 1);
    // @ts-ignore
    texture._addReferCount(3);

    // In-frame: destroy(true) bypasses refCount check, but gets deferred
    // @ts-ignore
    engine._frameInProcess = true;
    texture.destroy(true);
    // @ts-ignore
    engine._frameInProcess = false;

    expect(texture.pendingDestroy).eq(true);
    expect(texture.destroyed).eq(false);

    // End-of-frame: _processPendingDestroyObjects calls destroy() without args,
    // force flag must not be lost, otherwise refCount=3 would block destruction
    // @ts-ignore
    engine._processPendingDestroyObjects();

    expect(texture.destroyed).eq(true);
  });
});
