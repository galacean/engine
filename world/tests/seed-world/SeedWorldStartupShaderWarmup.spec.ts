import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MeshRenderer, PipelineStage, Shader, ShaderMacro, ShaderMacroCollection } from "@galacean/engine";
import { collectSeedWorldRendererVariants } from "@galacean/engine-world-planning/world/SeedWorldShaderWarmup";
import {
  findMissingSeedWorldShaderVariants,
  withSeedWorldMasonryDitherVariants
} from "@galacean/engine-world-planning/world/SeedWorldShaderVariantCoverage";
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
  vegetation?: { prepareShaderWarmup: () => { renderers: readonly unknown[]; dispose: () => void } },
  pageUrl = new URL("http://localhost/")
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
  const warmupVariants = vi.fn(async (_engine, _variants, _options) => {
    events.push("compile-deferred");
    return {
      requested: 1,
      compiled: 1,
      parallelCompileSupported: parallelCompile,
      deferred: [],
      issues: [],
      elapsedMilliseconds: 5,
      longestVariantMilliseconds: 5
    };
  });
  const collectVariants = vi.fn((_engine, _scene, _camera, _capturedRoots, options) =>
    options?.onlyEnabledRenderers
      ? [{ shader: "Terrain/Terrain", si: 0, pi: 0, macros: [] }]
      : [
          { shader: "Terrain/Terrain", si: 0, pi: 0, macros: [] },
          { shader: "Masonry/Brick", si: 0, pi: 0, macros: [] }
        ]
  );
  const run = () =>
    runSeedWorldStartupShaderWarmup({
      precompileShaders: enabled,
      engine: {} as any,
      scene: { rootEntities: roots } as any,
      camera: { enabled: true } as any,
      pageUrl,
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
        collectSeedWorldRendererVariants: collectVariants as any,
        findMissingSeedWorldShaderVariants,
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
    expect(f.warmupVariants).not.toHaveBeenCalled();
    f.animal.resolve();
    await task;
    expect(f.events).toEqual(["lod", "hud", "compile-deferred"]);
    expect(f.collectVariants).toHaveBeenCalledTimes(2);
    expect(f.collectVariants.mock.calls[0][4].overlayRenderers).toEqual(["hidden-hud"]);
  });
  it("warms prioritized primary variants in parallel before reveal and defers secondary template variants", async () => {
    const disposeMasonry = vi.fn();
    const disposeVegetation = vi.fn();
    const fakeRenderer = { name: "lod1-warmup" };
    const fakeVegRenderer = { name: "unmaterialized-tree-warmup" };
    const f = fixture(
        true,
        false,
        true,
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
    expect(f.events).toEqual(["lod", "hud", "compile-deferred"]);
    expect(f.warmup).not.toHaveBeenCalled();
    expect(f.warmupVariants).toHaveBeenCalledOnce();
    expect(f.warmupVariants.mock.calls[0][2]).toMatchObject({
      preserveOrder: true,
      maximumPendingPrograms: 16
    });
    expect(f.warmupVariants.mock.calls[0][2].maxElapsedMilliseconds).toBeUndefined();
    expect(f.collectVariants).toHaveBeenCalledTimes(2);
    expect(f.collectVariants.mock.calls[0][4]).toMatchObject({
      onlyEnabledRenderers: true,
      includeMasonryDither: false,
      includeMasonryEntrance: true,
      includeInstanceEntrance: false,
      includeLodDither: false,
      includeLiquidGlassMask: false,
      includePhotoCopy: false
    });
    expect(f.collectVariants.mock.calls[0][4].additionalRenderers).toBeUndefined();
    expect(f.collectVariants.mock.calls[0][4].additionalPointLightCounts).toBeUndefined();
    expect(f.collectVariants.mock.calls[1][4]).toMatchObject({
      additionalRenderers: [fakeRenderer, { name: "rock-grass-warmup" }],
      additionalInstancedRenderers: [fakeVegRenderer],
      additionalPointLightCounts: [4],
      includeLiquidGlassMask: true,
      includePhotoCopy: true
    });
    expect(disposeMasonry).toHaveBeenCalledOnce();
    expect(disposeVegetation).toHaveBeenCalledOnce();
    expect(f.warmupVariants.mock.calls[0][2].signal).toBe(f.editorLifetime.signal);
    expect(result.deferredShaderVariants).toEqual([{ shader: "Masonry/Brick", si: 0, pi: 0, macros: [] }]);
  });
  it("compiles all template variants synchronously before reveal when agentTrace=1 is requested", async () => {
    const disposeMasonry = vi.fn();
    const disposeVegetation = vi.fn();
    const fakeRenderer = { name: "lod1-warmup" };
    const fakeVegRenderer = { name: "unmaterialized-tree-warmup" };
    const f = fixture(
        true,
        false,
        true,
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
        },
        new URL("http://localhost/?agentTrace=1")
      ),
      task = f.run();
    f.farm.resolve();
    f.animal.resolve();
    const result = await task;
    expect(f.events).toEqual(["lod", "hud", "compile"]);
    expect(f.warmup).toHaveBeenCalledOnce();
    expect(f.warmup.mock.calls[0][4]).toMatchObject({
      signal: f.editorLifetime.signal,
      maximumPendingPrograms: 16,
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
  it("defers secondary template variants to idle with a startup budget when KHR_parallel_shader_compile is unavailable", async () => {
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
    expect(f.events).toEqual(["lod", "hud", "compile-deferred"]);
    expect(f.warmup).not.toHaveBeenCalled();
    expect(f.warmupVariants).toHaveBeenCalledOnce();
    expect(f.warmupVariants.mock.calls[0][2]).toMatchObject({
      preserveOrder: true,
      maximumPendingPrograms: 1,
      maxElapsedMilliseconds: 6500
    });
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
      additionalRenderers: [fakeRenderer, { name: "rock-grass-warmup" }],
      additionalInstancedRenderers: [fakeVegRenderer],
      additionalPointLightCounts: [4]
    });
    expect(disposeMasonry).toHaveBeenCalledOnce();
    expect(disposeVegetation).toHaveBeenCalledOnce();
    expect(result.deferredShaderVariants).toEqual([{ shader: "Masonry/Brick", si: 0, pi: 0, macros: [] }]);
  });
  it("promotes steady-state masonry variants paired with spawn-visible entrance variants and GlobalProxy ShadowCaster ahead of offscreen secondary variants when !parallelCompile", async () => {
    const entranceOn = {
      shader: "Masonry/DistanceSurface",
      si: 0,
      pi: 0,
      macros: [{ n: "RENDERER_MASONRY_ENTRANCE" }]
    };
    const steadyState = {
      shader: "Masonry/DistanceSurface",
      si: 0,
      pi: 0,
      macros: []
    };
    const globalProxyEntrance = {
      shader: "Masonry/GlobalProxy",
      si: 0,
      pi: 2,
      macros: [{ n: "GLOBAL_PROXY_ENTRANCE" }]
    };
    const globalProxySteady = {
      shader: "Masonry/GlobalProxy",
      si: 0,
      pi: 2,
      macros: []
    };
    const globalProxyShadow = {
      shader: "Masonry/GlobalProxy",
      si: 0,
      pi: 0,
      macros: []
    };
    const photoCopy = { shader: "SeedWorld/PhotoCopy", si: 0, pi: 0, macros: [] };
    const vegetation = { shader: "Terrain/Vegetation", si: 0, pi: 0, macros: [] };
    const f = fixture(true, false, false);
    f.collectVariants.mockReset();
    f.collectVariants
      .mockReturnValueOnce([entranceOn, globalProxyEntrance])
      .mockReturnValueOnce([
        entranceOn,
        globalProxyEntrance,
        photoCopy,
        vegetation,
        steadyState,
        globalProxySteady,
        globalProxyShadow
      ]);

    const task = f.run();
    f.farm.resolve();
    f.animal.resolve();
    const result = await task;

    expect(result.deferredShaderVariants.map((v) => `${v.shader}#${v.pi}`)).toEqual([
      "Masonry/DistanceSurface#0",
      "Masonry/GlobalProxy#0",
      "Masonry/GlobalProxy#2",
      "SeedWorld/PhotoCopy#0",
      "Terrain/Vegetation#0"
    ]);
  });

  it("still promotes Masonry/GlobalProxy ShadowCaster on !parallelCompile when scene baseline has active PointLights, while leaving dither unpromoted", async () => {
    const fakeGlobalProxyShader = {
      subShaders: [
        {
          passes: [
            { getTagValue: () => PipelineStage.ShadowCaster },
            { getTagValue: () => PipelineStage.DepthOnly },
            { getTagValue: () => PipelineStage.Forward }
          ]
        }
      ]
    } as unknown as Shader;
    const spy = vi.spyOn(Shader, "find").mockImplementation((name: string) =>
      name === "Masonry/GlobalProxy" ? fakeGlobalProxyShader : (null as unknown as Shader)
    );
    try {
      const basePL = { n: "SCENE_POINT_LIGHT_COUNT", v: "1" };
      const globalProxyEntrance = {
        shader: "Masonry/GlobalProxy",
        si: 0,
        pi: 2,
        macros: [basePL, { n: "GLOBAL_PROXY_ENTRANCE" }]
      };
      const globalProxySteady = { shader: "Masonry/GlobalProxy", si: 0, pi: 2, macros: [basePL] };
      const globalProxyShadow = { shader: "Masonry/GlobalProxy", si: 0, pi: 0, macros: [basePL] };
      const globalProxyShadowDither = {
        shader: "Masonry/GlobalProxy",
        si: 0,
        pi: 0,
        macros: [basePL, { n: "GLOBAL_PROXY_DITHER" }]
      };
      const photoCopy = { shader: "SeedWorld/PhotoCopy", si: 0, pi: 0, macros: [] };

      const f = fixture(true, false, false);
      f.collectVariants.mockReset();
      f.collectVariants
        .mockReturnValueOnce([globalProxyEntrance])
        .mockReturnValueOnce([
          globalProxyEntrance,
          photoCopy,
          globalProxyShadowDither,
          globalProxySteady,
          globalProxyShadow
        ]);

      const task = f.run();
      f.farm.resolve();
      f.animal.resolve();
      const result = await task;

      expect(
        result.deferredShaderVariants.map(
          (v) => `${v.shader}#${v.pi}${v.macros.some((m) => m.n === "GLOBAL_PROXY_DITHER") ? ":dither" : ""}`
        )
      ).toEqual([
        "Masonry/GlobalProxy#0",
        "Masonry/GlobalProxy#2",
        "SeedWorld/PhotoCopy#0",
        "Masonry/GlobalProxy#0:dither"
      ]);
    } finally {
      spy.mockRestore();
    }
  });
  it("promotes Masonry/GlobalProxy steady ShadowCaster ahead of secondary variants even when parallelCompile is true", async () => {
    const makePass = (stage: PipelineStage) => ({
      _platformTarget: 0,
      getTagValue: (key: string) => (key === "pipelineStage" ? stage : undefined),
      _getShaderProgram: () => ({})
    });
    const gpShader = {
      name: "Masonry/GlobalProxy",
      destroyed: false,
      subShaders: [
        {
          passes: [
            makePass(PipelineStage.ShadowCaster),
            makePass(PipelineStage.DepthOnly),
            makePass(PipelineStage.Forward)
          ]
        }
      ]
    } as unknown as Shader;
    const gpShadowOnlyShader = {
      name: "Masonry/GlobalProxyShadowOnly",
      destroyed: false,
      subShaders: [{ passes: [makePass(PipelineStage.ShadowCaster)] }]
    } as unknown as Shader;
    const vegShader = {
      name: "Terrain/Vegetation",
      destroyed: false,
      subShaders: [{ passes: [makePass(PipelineStage.Forward), makePass(PipelineStage.ShadowCaster)] }]
    } as unknown as Shader;
    const spy = vi.spyOn(Shader, "find").mockImplementation((name: string) => {
      if (name === "Masonry/GlobalProxy") return gpShader;
      if (name === "Masonry/GlobalProxyShadowOnly") return gpShadowOnlyShader;
      if (name === "Terrain/Vegetation") return vegShader;
      return null as unknown as Shader;
    });
    try {
      const entranceMacros = new ShaderMacroCollection();
      entranceMacros.enable(ShaderMacro.getByName("GLOBAL_PROXY_ENTRANCE"));
      entranceMacros.enable(ShaderMacro.getByName("GLOBAL_PROXY_PLASTER"));
      const gpMat = { destroyed: false, shader: gpShader, shaderData: { _macroCollection: entranceMacros } };
      const gpShadowOnlyMat = {
        destroyed: false,
        shader: gpShadowOnlyShader,
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      };
      const vegMat = { destroyed: false, shader: vegShader, shaderData: { _macroCollection: new ShaderMacroCollection() } };
      const makeRenderer = (mat: object, castShadows: boolean) => {
        const r = Object.create(MeshRenderer.prototype);
        Object.defineProperties(r, {
          entity: { value: { isActiveInHierarchy: true } },
          shaderData: { value: { _macroCollection: new ShaderMacroCollection() } },
          mesh: { value: { _primitive: { vertexElements: [{ attribute: "NORMAL" }] } } },
          enabled: { value: true },
          castShadows: { value: castShadows },
          _update: { value: () => {} },
          getMaterials: { value: () => [mat] }
        });
        return r;
      };
      const gpRenderer = makeRenderer(gpMat, false);
      const vegRenderer = makeRenderer(vegMat, true);
      const rootEntity = {
        isActiveInHierarchy: true,
        children: [],
        getComponentsIncludeChildren: (_type: unknown, out: unknown[]) => {
          out.length = 0;
          out.push(gpRenderer);
          return out;
        }
      };
      let primaryCaptured: Array<{ shader: string; pi: number; macros: readonly { n: string }[] }> = [];
      const result = await runSeedWorldStartupShaderWarmup({
        precompileShaders: true,
        engine: { _macroCollection: new ShaderMacroCollection() } as any,
        scene: {
          rootEntities: [rootEntity],
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 }
        } as any,
        camera: {
          enabled: true,
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          _updateShaderData: () => {}
        } as any,
        pageUrl: new URL("http://localhost/"),
        canvas: { dataset: {} } as any,
        showAssistant: false,
        isDisposed: () => false,
        progress: vi.fn(),
        timed: (_name, work) => work(),
        prepareMasonryShaderWarmup: async () => ({
          renderers: [],
          extraMaterials: new Map([[gpRenderer, [gpShadowOnlyMat as any]]]),
          decorationPointLightBudget: 0,
          dispose: () => {}
        }),
        prepareVegetationShaderWarmup: () => ({ renderers: [vegRenderer], dispose: () => {} }),
        prepareAssistantPresentation: () => undefined,
        getPostProcessWarmupState: () => ({ enabled: false }) as any,
        additionalBackgroundMaterials: [],
        warmupOperations: {
          hasParallelShaderCompile: () => true,
          collectSeedWorldRendererVariants,
          findMissingSeedWorldShaderVariants,
          warmupSeedWorldShaderVariants: async (_engine, variants) => {
            primaryCaptured = variants as typeof primaryCaptured;
            return {
              requested: variants.length,
              compiled: variants.length,
              parallelCompileSupported: true,
              deferred: [],
              issues: [],
              elapsedMilliseconds: 1,
              longestVariantMilliseconds: 1
            };
          }
        }
      });
      const isSteadyShadow = (v: { shader: string; pi: number; macros: readonly { n: string }[] }) =>
        v.shader === "Masonry/GlobalProxy" &&
        v.pi === 0 &&
        !v.macros.some((m) => m.n === "GLOBAL_PROXY_ENTRANCE" || m.n === "GLOBAL_PROXY_DITHER");
      const isShadowOnly = (v: { shader: string; pi: number; macros: readonly { n: string }[] }) =>
        v.shader === "Masonry/GlobalProxyShadowOnly" &&
        v.pi === 0 &&
        !v.macros.some((m) => m.n === "GLOBAL_PROXY_ENTRANCE");
      expect(primaryCaptured.some(isSteadyShadow)).toBe(false);
      expect(primaryCaptured.some(isShadowOnly)).toBe(false);
      const steadyIdx = result.deferredShaderVariants.findIndex(isSteadyShadow);
      const shadowOnlyIdx = result.deferredShaderVariants.findIndex(isShadowOnly);
      const firstVegIdx = result.deferredShaderVariants.findIndex((v) => v.shader === "Terrain/Vegetation");
      const firstDitherIdx = result.deferredShaderVariants.findIndex((v) =>
        v.macros.some((m) => m.n === "GLOBAL_PROXY_DITHER")
      );
      expect(steadyIdx).toBe(0);
      expect(shadowOnlyIdx).toBeGreaterThan(0);
      expect(shadowOnlyIdx).toBeLessThan(firstVegIdx);
      expect(steadyIdx).toBeLessThan(firstVegIdx);
      expect(steadyIdx).toBeLessThan(firstDitherIdx);
      expect(shadowOnlyIdx).toBeLessThan(firstDitherIdx);
    } finally {
      spy.mockRestore();
    }
  });
  it("prioritizes Forward passes over ShadowCaster and DepthOnly passes by pipelineStage tag even when Forward pi > 0", async () => {
    const fakeShaders = new Map<string, Shader>([
      [
        "Masonry/GlobalProxy",
        {
          subShaders: [
            {
              passes: [
                { getTagValue: () => PipelineStage.ShadowCaster },
                { getTagValue: () => PipelineStage.DepthOnly },
                { getTagValue: () => PipelineStage.Forward }
              ]
            }
          ]
        } as unknown as Shader
      ],
      [
        "Masonry/FarProxy",
        {
          subShaders: [
            {
              passes: [{ getTagValue: () => PipelineStage.DepthOnly }, { getTagValue: () => PipelineStage.Forward }]
            }
          ]
        } as unknown as Shader
      ],
      [
        "PBR",
        {
          subShaders: [
            {
              passes: [
                { getTagValue: () => PipelineStage.ShadowCaster },
                { getTagValue: () => PipelineStage.ShadowCaster },
                { getTagValue: () => PipelineStage.DepthOnly },
                { getTagValue: () => PipelineStage.Forward }
              ]
            }
          ]
        } as unknown as Shader
      ]
    ]);
    const spy = vi.spyOn(Shader, "find").mockImplementation((name: string) => fakeShaders.get(name)!);
    try {
      const f = fixture(true, false, false);
      const inputVariants = [
        { shader: "Masonry/GlobalProxy", si: 0, pi: 0, macros: [] },
        { shader: "Masonry/GlobalProxy", si: 0, pi: 1, macros: [] },
        { shader: "Masonry/GlobalProxy", si: 0, pi: 2, macros: [] },
        { shader: "Masonry/FarProxy", si: 0, pi: 0, macros: [] },
        { shader: "Masonry/FarProxy", si: 0, pi: 1, macros: [] },
        { shader: "PBR", si: 0, pi: 0, macros: [] },
        { shader: "PBR", si: 0, pi: 3, macros: [] }
      ];
      f.collectVariants.mockReset();
      f.collectVariants.mockReturnValue(inputVariants);
      const task = f.run();
      f.farm.resolve();
      f.animal.resolve();
      await task;

      const ordered = f.warmupVariants.mock.calls[0][1] as Array<{ shader: string; pi: number }>;
      expect(ordered.map((v) => `${v.shader}:${v.pi}`)).toEqual([
        "Masonry/FarProxy:1",
        "Masonry/GlobalProxy:2",
        "PBR:3",
        "Masonry/FarProxy:0",
        "Masonry/GlobalProxy:0",
        "Masonry/GlobalProxy:1",
        "PBR:0"
      ]);
    } finally {
      spy.mockRestore();
    }
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
  it("defers CRUD reveal/wave variants to deferredShaderVariants when KHR_parallel_shader_compile is unavailable", async () => {
    const capturedOptions: any[] = [];
    const run = (parallel: boolean) =>
      runSeedWorldStartupShaderWarmup({
        precompileShaders: true,
        engine: {} as any,
        scene: { rootEntities: [] } as any,
        camera: { enabled: true } as any,
        pageUrl: new URL("http://localhost/?agentTrace=1"),
        canvas: { dataset: {} } as any,
        showAssistant: false,
        isDisposed: () => false,
        progress: vi.fn(),
        timed: (_name, work) => work(),
        prepareAssistantPresentation: () => undefined,
        getPostProcessWarmupState: () => ({ enabled: false }) as any,
        additionalBackgroundMaterials: [],
        warmupOperations: {
          hasParallelShaderCompile: () => parallel,
          warmupSeedWorldRendererVariants: vi.fn(async (_engine, _scene, _camera, _roots, options: any) => {
            capturedOptions.push(options);
            options.onVariants?.([
              { shader: "Terrain/Terrain", si: 0, pi: 0, macros: [] },
              { shader: "Terrain/Vegetation", si: 0, pi: 0, macros: [] }
            ]);
            return {
              requested: 2,
              compiled: 2,
              parallelCompileSupported: parallel,
              issues: [],
              elapsedMilliseconds: 5,
              longestVariantMilliseconds: 5
            };
          }) as any
        }
      });

    const mobile = await run(false);
    expect(capturedOptions[0].includeGenerationReveal).toBe(false);
    expect(
      mobile.deferredShaderVariants.some(
        (v) => v.shader === "Terrain/Terrain" && v.macros.some((m) => m.n === "TERRAIN_PROJECT_ENTRANCE_WAVE")
      )
    ).toBe(true);
    expect(
      mobile.deferredShaderVariants.some(
        (v) => v.shader === "Terrain/Vegetation" && v.macros.some((m) => m.n === "RENDERER_GENERATION_REVEAL")
      )
    ).toBe(true);

    const desktop = await run(true);
    expect(capturedOptions[1].includeGenerationReveal).toBe(true);
    expect(desktop.deferredShaderVariants).toEqual([]);
  });
  it("collects deferredBackgroundMaterials without leaking mismatched postProcess variants when parallelCompile is false", async () => {
    const fakeMaterial = (shaderName: string) =>
      ({
        destroyed: false,
        shader: {
          name: shaderName,
          destroyed: false,
          subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
        },
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      }) as any;
    const bloomMat = fakeMaterial("PostProcess/Bloom");
    const uberMat = fakeMaterial("PostProcess/Uber");
    const holoMat = fakeMaterial("SeedWorld/HologramRainbow");
    const holoAddMat = fakeMaterial("SeedWorld/HologramRainbowAdditive");
    const engine = {
      _macroCollection: new ShaderMacroCollection(),
      _hardwareRenderer: { isWebGL2: true },
      _basicResources: {},
      _getActivePostProcessPasses: () => [{ isActive: true, _bloomMaterial: bloomMat, _uberMaterial: uberMat }]
    } as any;
    const scene = {
      rootEntities: [],
      background: { mode: 0 },
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    } as any;
    const camera = {
      enabled: true,
      enablePostProcess: true,
      renderTarget: null,
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      _updateShaderData: vi.fn(),
      _isIndependentCanvasEnabled: () => false
    } as any;

    const result = await runSeedWorldStartupShaderWarmup({
      precompileShaders: true,
      engine,
      scene,
      camera,
      pageUrl: new URL("http://localhost/?agentTrace=1"),
      canvas: { dataset: {} } as any,
      showAssistant: false,
      isDisposed: () => false,
      progress: vi.fn(),
      timed: (_name, work) => work(),
      prepareAssistantPresentation: () => undefined,
      getPostProcessWarmupState: () => ({
        enabled: true,
        bloom: true,
        bloomHighQuality: true,
        bloomDirt: false,
        colorAdjustments: true,
        tonemappingMode: 1
      }),
      additionalBackgroundMaterials: [],
      deferredBackgroundMaterials: [holoMat, holoAddMat],
      warmupOperations: {
        hasParallelShaderCompile: () => false,
        warmupSeedWorldRendererVariants: vi.fn(async (_e, _s, _c, _r, options: any) => {
          options.onVariants?.([]);
          return {
            requested: 0,
            compiled: 0,
            parallelCompileSupported: false,
            issues: [],
            elapsedMilliseconds: 1,
            longestVariantMilliseconds: 1
          };
        }) as any
      }
    });

    expect(camera._updateShaderData).toHaveBeenCalledOnce();
    expect(result.deferredShaderVariants.map((v) => v.shader)).toEqual([
      "SeedWorld/HologramRainbow",
      "SeedWorld/HologramRainbowAdditive"
    ]);
  });

  it("expands dither variants for SupportSurface, FarProxy, GlobalProxy, and resident Masonry shaders while skipping entrance-only entries", () => {
    const hashShader = `Masonry/${"a".repeat(64)}`;
    const expanded = withSeedWorldMasonryDitherVariants([
      { shader: hashShader, si: 0, pi: 0, macros: [] },
      { shader: "Masonry/SupportSurface", si: 0, pi: 0, macros: [] },
      { shader: "Masonry/FarProxy", si: 0, pi: 0, macros: [] },
      { shader: "Masonry/GlobalProxy", si: 0, pi: 0, macros: [] },
      { shader: "Masonry/SupportSurface", si: 0, pi: 0, macros: [{ n: "RENDERER_MASONRY_ENTRANCE" }] },
      { shader: "Masonry/GlobalProxy", si: 0, pi: 0, macros: [{ n: "GLOBAL_PROXY_ENTRANCE" }] }
    ]);
    const has = (shader: string, macro: string) =>
      expanded.some((e) => e.shader === shader && e.macros.some((m) => m.n === macro));
    expect(has(hashShader, "RENDERER_MASONRY_DITHER")).toBe(true);
    expect(has("Masonry/SupportSurface", "MASONRY_SURFACE_DITHER")).toBe(true);
    expect(has("Masonry/FarProxy", "MASONRY_FAR_DITHER")).toBe(true);
    expect(has("Masonry/GlobalProxy", "GLOBAL_PROXY_DITHER")).toBe(true);
    expect(
      expanded.some(
        (e) =>
          e.shader === "Masonry/SupportSurface" &&
          e.macros.some((m) => m.n === "RENDERER_MASONRY_ENTRANCE") &&
          e.macros.some((m) => m.n === "MASONRY_SURFACE_DITHER")
      )
    ).toBe(false);
    expect(
      expanded.some(
        (e) =>
          e.shader === "Masonry/GlobalProxy" &&
          e.macros.some((m) => m.n === "GLOBAL_PROXY_ENTRANCE") &&
          e.macros.some((m) => m.n === "GLOBAL_PROXY_DITHER")
      )
    ).toBe(false);
  });

  it("prioritizes WaterFar/ and AIWorld/ water shaders in primary tier 1 and promotes Masonry/GlobalProxyShadowOnly when spawn masonry entrance has no GlobalProxy", async () => {
    const fakeShaders = new Map<string, Shader>([
      [
        "Water/Ocean.v1",
        { subShaders: [{ passes: [{ getTagValue: () => PipelineStage.Forward }] }] } as unknown as Shader
      ],
      [
        "WaterFar/test-uuid",
        { subShaders: [{ passes: [{ getTagValue: () => PipelineStage.Forward }] }] } as unknown as Shader
      ],
      [
        "AIWorld/OceanFar",
        { subShaders: [{ passes: [{ getTagValue: () => PipelineStage.Forward }] }] } as unknown as Shader
      ],
      [
        "Terrain/Vegetation",
        {
          subShaders: [
            { passes: [{ getTagValue: () => PipelineStage.ShadowCaster }, { getTagValue: () => PipelineStage.Forward }] }
          ]
        } as unknown as Shader
      ],
      [
        "Masonry/SupportSurface",
        {
          subShaders: [
            { passes: [{ getTagValue: () => PipelineStage.ShadowCaster }, { getTagValue: () => PipelineStage.Forward }] }
          ]
        } as unknown as Shader
      ],
      [
        "Masonry/GlobalProxyShadowOnly",
        { subShaders: [{ passes: [{ getTagValue: () => PipelineStage.ShadowCaster }] }] } as unknown as Shader
      ]
    ]);
    const spy = vi.spyOn(Shader, "find").mockImplementation((name: string) => fakeShaders.get(name)!);
    try {
      let orderedPrimary: readonly { shader: string; pi: number }[] = [];
      const primaryPool = [
        { shader: "Masonry/SupportSurface", si: 0, pi: 1, macros: [{ n: "RENDERER_MASONRY_ENTRANCE" }] },
        { shader: "Terrain/Vegetation", si: 0, pi: 1, macros: [] },
        { shader: "WaterFar/test-uuid", si: 0, pi: 0, macros: [] },
        { shader: "AIWorld/OceanFar", si: 0, pi: 0, macros: [] },
        { shader: "Water/Ocean.v1", si: 0, pi: 0, macros: [] }
      ];
      const allPool = [
        ...primaryPool,
        { shader: "Terrain/Vegetation", si: 0, pi: 0, macros: [] },
        { shader: "Masonry/GlobalProxyShadowOnly", si: 0, pi: 0, macros: [] }
      ];
      const result = await runSeedWorldStartupShaderWarmup({
        precompileShaders: true,
        engine: { _macroCollection: new ShaderMacroCollection() } as any,
        scene: { rootEntities: [] } as any,
        camera: { enabled: true } as any,
        pageUrl: new URL("http://localhost/"),
        canvas: { dataset: {} } as any,
        showAssistant: false,
        isDisposed: () => false,
        progress: vi.fn(),
        timed: (_name, work) => work(),
        prepareAssistantPresentation: () => undefined,
        getPostProcessWarmupState: () => ({ enabled: false }) as any,
        additionalBackgroundMaterials: [],
        warmupOperations: {
          hasParallelShaderCompile: () => false,
          collectSeedWorldRendererVariants: (_e, _s, _c, _r, opts) =>
            opts?.onlyEnabledRenderers ? primaryPool : allPool,
          findMissingSeedWorldShaderVariants,
          warmupSeedWorldShaderVariants: async (_engine, variants) => {
            orderedPrimary = variants;
            return {
              requested: variants.length,
              compiled: variants.length,
              parallelCompileSupported: false,
              deferred: [],
              issues: [],
              elapsedMilliseconds: 1,
              longestVariantMilliseconds: 1
            };
          }
        }
      });

      expect(orderedPrimary.map((v) => v.shader)).toEqual([
        "AIWorld/OceanFar",
        "Water/Ocean.v1",
        "WaterFar/test-uuid",
        "Terrain/Vegetation",
        "Masonry/SupportSurface"
      ]);
      expect(result.deferredShaderVariants.map((v) => `${v.shader}:${v.pi}`)).toEqual([
        "Masonry/GlobalProxyShadowOnly:0",
        "Terrain/Vegetation:0"
      ]);
    } finally {
      spy.mockRestore();
    }
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
