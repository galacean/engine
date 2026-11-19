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
  masonry?: { prepareShaderWarmup: (signal: AbortSignal) => Promise<any> }
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
  const warmupVariants = vi.fn(async (_engine, ordered, _options) => {
    events.push("compile-deferred");
    return {
      requested: ordered.length,
      compiled: ordered.length,
      parallelCompileSupported: false,
      issues: [],
      elapsedMilliseconds: 5,
      longestVariantMilliseconds: 5
    };
  });
  const collectVariants = vi.fn((_engine, _scene, _camera, _roots, opts) =>
    opts?.onlyEnabledRenderers
      ? [{ shader: "Terrain/Terrain", ssi: 0, pi: 0, m: [] }]
      : [
          { shader: "Terrain/Terrain", ssi: 0, pi: 0, m: [] },
          { shader: "Masonry/Brick", ssi: 0, pi: 0, m: [] }
        ]
  );
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
      prepareMasonryShaderWarmup: masonry ? (signal) => masonry.prepareShaderWarmup(signal) : undefined,
      prepareAssistantPresentation: () => {
        events.push("hud");
        return { root: { getComponentsIncludeChildren: () => ["hidden-hud"] } as any };
      },
      getPostProcessWarmupState: () => ({ enabled: true }) as any,
      additionalBackgroundMaterials: [],
      warmupOperations: {
        hasParallelShaderCompile: () => parallelCompile,
        collectSeedWorldRendererVariants: collectVariants as any,
        findMissingSeedWorldShaderVariants: (_primary, all) => all.slice(1),
        warmupSeedWorldRendererVariants: warmup as any,
        warmupSeedWorldShaderVariants: warmupVariants as any
      }
    });
  return {
    farm,
    animal,
    warmup,
    warmupVariants,
    collectVariants,
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
  it("defers secondary variants when KHR_parallel_shader_compile is unavailable", async () => {
    const dispose = vi.fn();
    const fakeRenderer = { name: "lod1-warmup" };
    const f = fixture(true, false, false, {
      prepareShaderWarmup: async () => ({
        renderers: [fakeRenderer],
        decorationPointLightBudget: 4,
        dispose
      })
    }),
      task = f.run();
    f.farm.resolve();
    f.animal.resolve();
    const result = await task;
    expect(f.events).toEqual(["lod", "hud", "compile-deferred"]);
    expect(f.warmup).not.toHaveBeenCalled();
    expect(f.warmupVariants).toHaveBeenCalledOnce();
    expect(f.collectVariants).toHaveBeenCalledTimes(2);
    expect(f.collectVariants.mock.calls[0][4]).toMatchObject({
      onlyEnabledRenderers: true,
      includeMasonryDither: false,
      includeMasonryEntrance: false,
      includeInstanceEntrance: false,
      includeLodDither: false
    });
    expect(f.collectVariants.mock.calls[0][4].additionalRenderers).toBeUndefined();
    expect(f.collectVariants.mock.calls[1][4]).toMatchObject({
      additionalRenderers: [fakeRenderer],
      additionalPointLightCounts: [4]
    });
    expect(dispose).toHaveBeenCalledOnce();
    expect(result.deferredShaderVariants).toEqual([{ shader: "Masonry/Brick", ssi: 0, pi: 0, m: [] }]);
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
