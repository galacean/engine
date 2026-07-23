import type { Engine, Entity } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";
import type { HeightfieldWaterResource } from "../../runtime/heightfield/HeightfieldWaterResource";
import type { HeightfieldWaterRuntimeActivation } from "../../runtime/heightfield/HeightfieldWaterRuntimeController";
import {
  WaterOpticsSecondaryPoolRuntime,
  type WaterOpticsSecondaryPoolRuntimeFactory
} from "../../demo/examples/water-optics-lab/WaterOpticsSecondaryPoolRuntime";

function createDeferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
} {
  let resolvePromise!: () => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function createRoot(): Entity {
  return { isActive: false, destroy: vi.fn() } as unknown as Entity;
}

function createResource(id: string): HeightfieldWaterResource {
  return { id } as unknown as HeightfieldWaterResource;
}

function createRuntimeFactory(deferreds: readonly ReturnType<typeof createDeferred>[]) {
  const runtimes = deferreds.map((deferred) => ({
    activeSurfaceOpticsReadback: undefined,
    replaceActiveIncremental: vi.fn(async () => {
      await deferred.promise;
      return {} as HeightfieldWaterRuntimeActivation;
    }),
    setOpticalProfile: vi.fn(),
    setRefractionEnabled: vi.fn(),
    setCompositionMode: vi.fn(),
    setDepthWriteEnabled: vi.fn(),
    setRenderPriority: vi.fn(),
    setDebugMode: vi.fn(),
    setSurfaceTimeOverride: vi.fn(),
    setSurfaceOpticsBinding: vi.fn(),
    flushDeferredResources: vi.fn(),
    destroy: vi.fn()
  }));
  let index = 0;
  const factory: WaterOpticsSecondaryPoolRuntimeFactory = () => {
    const runtime = runtimes[index++];
    if (!runtime) throw new Error("Unexpected secondary Pool runtime allocation.");
    return runtime;
  };
  return { factory, runtimes };
}

describe("WaterOpticsSecondaryPoolRuntime generation ownership", () => {
  it("does not let an older rejected ensure release the newer runtime", async () => {
    const first = createDeferred();
    const second = createDeferred();
    const { factory, runtimes } = createRuntimeFactory([first, second]);
    const root = createRoot();
    const owner = new WaterOpticsSecondaryPoolRuntime({} as Engine, root, factory);
    owner.setVisible(true);

    const firstEnsure = owner.ensure(createResource("first"));
    const secondEnsure = owner.ensure(createResource("second"));
    first.reject(new Error("stale allocation failed"));
    second.resolve();

    await expect(firstEnsure).rejects.toThrow("stale allocation failed");
    await expect(secondEnsure).resolves.toBeUndefined();
    expect(runtimes[0].destroy).toHaveBeenCalledTimes(1);
    expect(runtimes[1].destroy).not.toHaveBeenCalled();
    expect(owner.metrics).toMatchObject({ created: true, visible: true, createCount: 2, destroyCount: 1 });
    expect(root.isActive).toBe(true);
  });

  it("does not resurrect a released pending runtime after its await completes", async () => {
    const pending = createDeferred();
    const { factory, runtimes } = createRuntimeFactory([pending]);
    const root = createRoot();
    const owner = new WaterOpticsSecondaryPoolRuntime({} as Engine, root, factory);
    owner.setVisible(true);

    const ensure = owner.ensure(createResource("pending"));
    owner.release();
    pending.resolve();
    await expect(ensure).resolves.toBeUndefined();

    expect(runtimes[0].destroy).toHaveBeenCalledTimes(1);
    expect(runtimes[0].flushDeferredResources).not.toHaveBeenCalled();
    expect(owner.metrics).toMatchObject({ created: false, visible: false, createCount: 1, destroyCount: 1 });
    expect(root.isActive).toBe(false);
  });
});
