import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PlanningAnimalHost } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalHost";
import { runSeedWorldStartupShaderWarmup } from "../../demos/seed-world/src/SeedWorldStartupShaderWarmup";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(
  enabled = true,
  disposed = false,
  parallelCompile = true,
  masonry?: { prepareShaderWarmup: (signal: AbortSignal) => Promise<any> },
  vegetation?: { prepareShaderWarmup: () => { renderers: readonly unknown[]; dispose: () => void } }
) {
  const farm = deferred(),
    animal = deferred(),
    roots: object[] = [],
    events: string[] = [];
  const editorLifetime = new AbortController();
  const warmup = vi.fn(async (_engine, _scene, _camera, capturedRoots, _options) => {
    expect(capturedRoots).toContain(farm);
    expect(capturedRoots).toContain(animal);
    events.push("compile");
    return {
      requested: 1,
      compiled: 1,
      parallelCompileSupported: parallelCompile,
      issues: [],
      elapsedMilliseconds: 5,
      longestVariantMilliseconds: 5
    };
  });
  const run = () =>
    runSeedWorldStartupShaderWarmup({
      precompileShaders: enabled,
      engine: {} as any,
      scene: { rootEntities: roots } as any,
      camera: { enabled: true } as any,
      pageUrl: new URL("http://localhost/"),
      canvas: { dataset: {} } as any,
      showAssistant: true,
      isDisposed: () => disposed,
      lifetimeSignal: editorLifetime.signal,
      progress: vi.fn(),
      timed: (_name, work) => work(),
      prepareFarmingPresentation: () =>
        farm.promise.then(() => {
          roots.push(farm);
        }),
      prepareAnimalPresentation: () =>
        animal.promise.then(() => {
          roots.push(animal);
        }),
      prepareVegetationPresentation: async () => {
        events.push("lod");
      },
      prepareVegetationShaderWarmup: vegetation ? () => vegetation.prepareShaderWarmup() as any : undefined,
      prepareRockGrassShaderWarmup: vegetation
        ? () => ({ renderers: [{ name: "rock-grass-warmup" }] as any, dispose: () => {} })
        : undefined,
      prepareMasonryShaderWarmup: masonry ? (signal) => masonry.prepareShaderWarmup(signal) : undefined,
      prepareAssistantPresentation: () => {
        events.push("hud");
        return { root: { getComponentsIncludeChildren: () => ["hidden-hud"] } as any };
      },
      hasOpaqueScreenSpaceReflection: () => false,
      getPostProcessWarmupState: () => ({ enabled: true }) as any,
      additionalBackgroundMaterials: [],
      warmupOperations: {
        hasParallelShaderCompile: () => parallelCompile,
        warmupSeedWorldRendererVariants: warmup as any
      }
    });
  return {
    farm,
    animal,
    warmup,
    events,
    editorLifetime,
    run
  };
}

describe("startup shader publication boundary", () => {
  it("SeedWorldDemo delegates startup precompilation to runSeedWorldStartupShaderWarmup", () => {
    const demoSource = readFileSync(new URL("../../demos/seed-world/SeedWorldDemo.ts", import.meta.url), "utf8");
    expect(demoSource).toContain("runSeedWorldStartupShaderWarmup({");
  });
  it("collects after both published owners finish and LOD state is applied", async () => {
    const f = fixture(),
      task = f.run();
    f.farm.resolve();
    await Promise.resolve();
    expect(f.warmup).not.toHaveBeenCalled();
    f.animal.resolve();
    await task;
    expect(f.events).toEqual(["lod", "hud", "compile"]);
    expect(f.warmup).toHaveBeenCalledOnce();
    expect(f.warmup.mock.calls[0][4].overlayRenderers).toEqual(["hidden-hud"]);
  });
  it("compiles all template variants before reveal without deferring when KHR_parallel_shader_compile is unavailable", async () => {
    const disposeMasonry = vi.fn();
    const disposeVegetation = vi.fn();
    const fakeRenderer = { name: "lod1-warmup" };
    const fakeVegRenderer = { name: "unmaterialized-tree-warmup" };
    const f = fixture(
        true,
        false,
        false,
        {
          prepareShaderWarmup: async () => ({
            renderers: [fakeRenderer],
            decorationPointLightBudget: 4,
            dispose: disposeMasonry
          })
        },
        {
          prepareShaderWarmup: () => ({
            renderers: [fakeVegRenderer],
            dispose: disposeVegetation
          })
        }
      ),
      task = f.run();
    f.farm.resolve();
    f.animal.resolve();
    const result = await task;
    expect(f.events).toEqual(["lod", "hud", "compile"]);
    expect(f.warmup).toHaveBeenCalledOnce();
    expect(f.warmup.mock.calls[0][4]).toMatchObject({
      maximumPendingPrograms: 1,
      additionalRenderers: [fakeRenderer, { name: "rock-grass-warmup" }],
      additionalInstancedRenderers: [fakeVegRenderer],
      additionalPointLightCounts: [4],
      includeLodDither: false,
      includeOpaqueScreenSpaceReflection: false,
      includeLiquidGlassMask: true,
      includePhotoCopy: true
    });
    expect(disposeMasonry).toHaveBeenCalledOnce();
    expect(disposeVegetation).toHaveBeenCalledOnce();
    expect(result.deferredShaderVariants).toEqual([]);
  });
  it("does not compile into a disposed scene after asynchronous preparation", async () => {
    const f = fixture(true, true),
      task = f.run();
    f.farm.resolve();
    f.animal.resolve();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(f.warmup).not.toHaveBeenCalled();
  });
  it("does not demand presentation resources when precompilation is disabled", async () => {
    const f = fixture(false);
    await f.run();
    expect(f.warmup).not.toHaveBeenCalled();
  });
  it("aborts and disposes late-resolving masonry shader warmup if a sibling presentation rejects", async () => {
    const masonryDeferred = deferred<{ dispose: () => void }>();
    let capturedSignal: AbortSignal | undefined;
    const dispose = vi.fn();
    const f = fixture(true, false, true, {
      prepareShaderWarmup: (signal) => {
        capturedSignal = signal;
        return masonryDeferred.promise;
      }
    });
    const task = f.run();
    f.farm.reject(new Error("farm failed"));
    await expect(task).rejects.toThrow("farm failed");
    expect(capturedSignal?.aborted).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    masonryDeferred.resolve({ dispose });
    await Promise.resolve();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.warmup).not.toHaveBeenCalled();
  });
});

describe("animal presentation preparation", () => {
  it("keeps disabled animals unloaded", async () => {
    const load = vi.fn();
    const host = new PlanningAnimalHost({} as any, () => ({ x: 0, z: 0 }), load);
    await host.preparePresentation();
    expect(load).not.toHaveBeenCalled();
  });
  it("joins module and admitted model preparation before startup collection", async () => {
    const model = deferred(),
      prepare = vi.fn(() => model.promise),
      synchronize = vi.fn(),
      update = vi.fn();
    const load = vi.fn(
      async () =>
        ({
          PlanningAnimalRuntime: class {
            synchronize = synchronize;
            update = update;
            preparePresentation = prepare;
          }
        }) as any
    );
    const host = new PlanningAnimalHost({} as any, () => ({ x: 0, z: 0 }), load);
    host.synchronize({} as any, { enabled: true } as any, {} as any);
    let completed = false;
    const task = host.preparePresentation().then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    expect(completed).toBe(false);
    expect(synchronize).toHaveBeenCalledOnce();
    expect(update.mock.calls.every(([dt]) => dt === 0)).toBe(true);
    model.resolve();
    await task;
    expect(completed).toBe(true);
    expect(load).toHaveBeenCalledOnce();
  });
});
