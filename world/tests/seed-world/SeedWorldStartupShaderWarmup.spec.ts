import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  MeshRenderer,
  PipelineStage,
  RenderQueueType,
  Renderer,
  ScreenSpaceReflectionQuality,
  Shader,
  ShaderMacro,
  ShaderMacroCollection
} from "@galacean/engine";
import {
  collectSeedWorldRendererVariants,
  warmupSeedWorldShaderVariants
} from "@galacean/engine-world-planning/world/SeedWorldShaderWarmup";
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
      maximumPendingPrograms: 28,
      pollIntervalMilliseconds: 4
    });
    expect(f.warmupVariants.mock.calls[0][2].maxElapsedMilliseconds).toBeUndefined();
    expect(f.collectVariants).toHaveBeenCalledTimes(2);
    expect(f.collectVariants.mock.calls[0][4]).toMatchObject({
      onlyEnabledRenderers: true,
      includeGenerationReveal: false,
      includeMasonryDither: false,
      includeMasonryEntrance: false,
      includeInstanceEntrance: false,
      includeLodDither: false,
      includeLiquidGlassMask: false,
      includePhotoCopy: false
    });
    expect(f.collectVariants.mock.calls[0][4].additionalRenderers).toBeUndefined();
    expect(f.collectVariants.mock.calls[1][4]).toMatchObject({
      includeGenerationReveal: false,
      additionalRenderers: [fakeRenderer, { name: "rock-grass-warmup" }],
      additionalInstancedRenderers: [fakeVegRenderer],
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
      maximumPendingPrograms: 28,
      pollIntervalMilliseconds: 4,
      additionalRenderers: [fakeRenderer, { name: "rock-grass-warmup" }],
      additionalInstancedRenderers: [fakeVegRenderer],
      includeLodDither: false,
      includeOpaqueScreenSpaceReflection: false,
      includeLiquidGlassMask: true,
      includePhotoCopy: true
    });
    expect(disposeMasonry).toHaveBeenCalledOnce();
    expect(disposeVegetation).toHaveBeenCalledOnce();
    expect(result.deferredShaderVariants).toEqual([]);
  });
  it("defers secondary template variants to idle without truncating primary first-screen variants when KHR_parallel_shader_compile is unavailable", async () => {
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
      maximumPendingPrograms: 1
    });
    expect(f.warmupVariants.mock.calls[0][2].maxElapsedMilliseconds).toBeUndefined();
    expect(f.collectVariants).toHaveBeenCalledTimes(2);
    expect(f.collectVariants.mock.calls[0][4]).toMatchObject({
      onlyEnabledRenderers: true,
      onlyFrustumVisible: true,
      includeMasonryDither: false,
      includeMasonryEntrance: false,
      includeInstanceEntrance: false,
      includeLodDither: false
    });
    expect(f.collectVariants.mock.calls[0][4].additionalRenderers).toBeUndefined();
    expect(f.collectVariants.mock.calls[1][4]).toMatchObject({
      additionalRenderers: [fakeRenderer, { name: "rock-grass-warmup" }],
      additionalInstancedRenderers: [fakeVegRenderer]
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
    const spy = vi
      .spyOn(Shader, "find")
      .mockImplementation((name: string) =>
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
      const vegMat = {
        destroyed: false,
        shader: vegShader,
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      };
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
      _hardwareRenderer: { supportsRendering: true },
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
            {
              passes: [{ getTagValue: () => PipelineStage.ShadowCaster }, { getTagValue: () => PipelineStage.Forward }]
            }
          ]
        } as unknown as Shader
      ],
      [
        "Masonry/SupportSurface",
        {
          subShaders: [
            {
              passes: [{ getTagValue: () => PipelineStage.ShadowCaster }, { getTagValue: () => PipelineStage.Forward }]
            }
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

  it("propagates ssrVerifyReceiverDepth through the default deferSecondary startup and deferred warmup paths", async () => {
    const enableSsrMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
    const verifyDepthMacro = ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH");

    const runScenario = async (url: string, renderQueue: RenderQueueType, includeOpaqueSsr = false) => {
      const progFullVerifyOverflow = {
        isValid: true,
        activeTextureCount: 17,
        _pollReady: () => true
      } as any;
      const progNoVerifySsr = {
        isValid: true,
        activeTextureCount: 16,
        _pollReady: () => true
      } as any;
      const progNoSsr = {
        isValid: true,
        activeTextureCount: 14,
        _pollReady: () => true
      } as any;
      const progDeferredOverflow = {
        isValid: true,
        activeTextureCount: 17,
        _pollReady: () => true
      } as any;
      const progDeferredNoVerifySsr = {
        isValid: true,
        activeTextureCount: 16,
        _pollReady: () => true
      } as any;
      const progDeferredNoSsr = {
        isValid: true,
        activeTextureCount: 14,
        _pollReady: () => true
      } as any;

      const forwardPass = {
        getTagValue: () => PipelineStage.Forward,
        _renderState: { _getRenderQueueByShaderData: () => renderQueue },
        _renderStateDataMap: {},
        _getShaderProgram(_engine: unknown, macros: ShaderMacroCollection) {
          if (macros.isEnable(enableSsrMacro) && macros.isEnable(verifyDepthMacro)) return progFullVerifyOverflow;
          if (macros.isEnable(enableSsrMacro)) return progNoVerifySsr;
          return progNoSsr;
        }
      };
      const receiverPass = {
        getTagValue: () => "SSRReceiver",
        _renderState: { _getRenderQueueByShaderData: () => renderQueue },
        _renderStateDataMap: {},
        _getShaderProgram: () => ({ isValid: true, activeTextureCount: 4, _pollReady: () => true })
      };
      const deferredPass = {
        getTagValue: () => PipelineStage.Forward,
        _renderState: { _getRenderQueueByShaderData: () => renderQueue },
        _renderStateDataMap: {},
        _getShaderProgram(_engine: unknown, macros: ShaderMacroCollection) {
          if (macros.isEnable(enableSsrMacro) && macros.isEnable(verifyDepthMacro)) return progDeferredOverflow;
          if (macros.isEnable(enableSsrMacro)) return progDeferredNoVerifySsr;
          return progDeferredNoSsr;
        }
      };
      const shaderName = renderQueue === RenderQueueType.Transparent ? "Water/Lake.v1" : "Terrain/Terrain";
      const primaryShader = {
        name: shaderName,
        destroyed: false,
        subShaders: [{ passes: [forwardPass, receiverPass] }]
      };
      const deferredShader = {
        name: "Water/Deferred.v1",
        destroyed: false,
        subShaders: [{ passes: [deferredPass, receiverPass] }]
      };
      const makeMaterial = (shader: typeof primaryShader) => ({
        destroyed: false,
        shader,
        shaderData: { _macroCollection: new ShaderMacroCollection() },
        screenSpaceReflectionIntensity: 1,
        screenSpaceReflectionBilateral: false
      });
      const makeRenderer = (shader: typeof primaryShader, enabled: boolean) => {
        const renderer = Object.create(MeshRenderer.prototype);
        Object.defineProperties(renderer, {
          entity: { value: { isActiveInHierarchy: true, destroyed: false, layer: 1 } },
          shaderData: { value: { _macroCollection: new ShaderMacroCollection() } },
          mesh: { value: { _primitive: { vertexElements: [{ attribute: "NORMAL" }] } } },
          enabled: { value: enabled },
          destroyed: { value: false },
          castShadows: { value: false },
          getMaterials: { value: () => [makeMaterial(shader)] }
        });
        return renderer;
      };
      const primaryRenderer = makeRenderer(primaryShader, true);
      const deferredRenderer = makeRenderer(deferredShader, false);

      const engine = {
        _macroCollection: new ShaderMacroCollection(),
        _hardwareRenderer: {
          supportsRendering: true,
          capability: { maxFragmentTextureUnits: 16, maxDrawBuffers: 4 },
          canIUse: () => true,
          gl: { getExtension: () => ({}) }
        }
      } as any;
      const scene = {
        rootEntities: [
          {
            getComponentsIncludeChildren(ctor: any, out: any[]) {
              out.length = 0;
              if (ctor === Renderer) out.push(primaryRenderer, deferredRenderer);
              return out;
            }
          }
        ],
        background: { mode: 0 },
        screenSpaceReflection: {
          enabled: true,
          intensity: 1,
          maxRoughness: 0.6,
          quality: ScreenSpaceReflectionQuality.Medium
        },
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      } as any;
      const camera = {
        enabled: true,
        enableScreenSpaceReflection: true,
        shaderData: { _macroCollection: new ShaderMacroCollection() },
        _updateShaderData() {},
        _isIndependentCanvasEnabled: () => false
      } as any;

      const findSpy = vi.spyOn(Shader, "find").mockImplementation((name: string) => {
        if (name === shaderName) return primaryShader as any;
        if (name === "Water/Deferred.v1") return deferredShader as any;
        return null;
      });
      try {
        const result = await runSeedWorldStartupShaderWarmup({
          precompileShaders: true,
          engine,
          scene,
          camera,
          pageUrl: new URL(url),
          canvas: { dataset: {} } as any,
          showAssistant: false,
          isDisposed: () => false,
          progress: () => {},
          timed: (_name, fn) => fn(),
          prepareAssistantPresentation: () => undefined,
          hasOpaqueScreenSpaceReflection: () => includeOpaqueSsr,
          getPostProcessWarmupState: () => ({ enabled: false }) as any,
          additionalBackgroundMaterials: []
        });
        if (result.deferredShaderVariants.length > 0) {
          await warmupSeedWorldShaderVariants(engine, result.deferredShaderVariants, {
            strict: false,
            preserveOrder: true,
            ssrVerifyReceiverDepth: result.ssrVerifyReceiverDepth
          });
        }
        return {
          ssrVerifyReceiverDepth: result.ssrVerifyReceiverDepth,
          deferredCount: result.deferredShaderVariants.length,
          primaryMaxUnits: progFullVerifyOverflow._ssrFallbackMaxUnits,
          primaryVerify: progFullVerifyOverflow._ssrFallbackVerify,
          primaryNoVerify: progFullVerifyOverflow._ssrFallbackNoVerify,
          expectedPrimaryNoSsr: progNoSsr,
          expectedPrimaryNoVerifySsr: progNoVerifySsr,
          deferredVerify: progDeferredOverflow._ssrFallbackVerify,
          deferredNoVerify: progDeferredOverflow._ssrFallbackNoVerify,
          expectedDeferredNoSsr: progDeferredNoSsr
        };
      } finally {
        findSpy.mockRestore();
      }
    };

    // Transparent SSR receiver (water) under default production deferSecondary path:
    // both primary startup warmup and post-ready deferred warmup must populate _ssrFallbackVerify.
    const transparentProd = await runScenario("http://localhost/?view=3d", RenderQueueType.Transparent);
    expect(transparentProd.ssrVerifyReceiverDepth).toBe(true);
    expect(transparentProd.deferredCount).toBeGreaterThan(0);
    expect(transparentProd.primaryMaxUnits).toBe(16);
    expect(transparentProd.primaryVerify).toBe(transparentProd.expectedPrimaryNoSsr);
    expect(transparentProd.primaryNoVerify).toBeNull();
    expect(transparentProd.deferredVerify).toBe(transparentProd.expectedDeferredNoSsr);
    expect(transparentProd.deferredNoVerify).toBeNull();

    // Parity with ?agentTrace=1 (non-deferred warmupSeedWorldRendererVariants path).
    const transparentTrace = await runScenario("http://localhost/?view=3d&agentTrace=1", RenderQueueType.Transparent);
    expect(transparentTrace.ssrVerifyReceiverDepth).toBe(true);
    expect(transparentTrace.primaryVerify).toBe(transparentTrace.expectedPrimaryNoSsr);
    expect(transparentTrace.primaryNoVerify).toBeNull();

    // Control: opaque-only SSR receiver does NOT force depth verification.
    const opaqueOnly = await runScenario("http://localhost/?view=3d", RenderQueueType.Opaque, true);
    expect(opaqueOnly.ssrVerifyReceiverDepth).toBe(false);
    expect(opaqueOnly.primaryVerify).toBeUndefined();
    expect(opaqueOnly.primaryNoVerify).toBeUndefined();
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
      prepareWarmup = vi.fn(async () => ({
        renderers: [],
        extraMaterials: new Map(),
        dispose: vi.fn()
      })),
      synchronize = vi.fn(),
      update = vi.fn();
    const load = vi.fn(
      async () =>
        ({
          PlanningAnimalRuntime: class {
            synchronize = synchronize;
            update = update;
            preparePresentation = prepare;
            prepareShaderWarmup = prepareWarmup;
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
    const warmup = await host.prepareShaderWarmup();
    expect(prepareWarmup).toHaveBeenCalledOnce();
    expect(warmup).toBeDefined();
  });

  it("keeps core masonry and rock-grass in primary startup while deferring distant animals, unmaterialized vegetation, and inactive roots when deferSecondaryCollection and precompileCoreMasonry are both enabled", async () => {
    const disposeMasonry = vi.fn();
    const disposeAnimal = vi.fn();
    const disposeVeg = vi.fn();
    const disposeRockGrass = vi.fn();
    const masonryRenderer = { name: "masonry-lod0" } as any;
    const animalRenderer = { name: "animal-distant-species" } as any;
    const vegRenderer = { name: "veg-offscreen" } as any;
    const rockGrassRenderer = { name: "rock-grass" } as any;
    const masonryMat = { name: "masonry-extra" } as any;
    const animalMat = { name: "animal-outlined" } as any;
    const deferredInactiveRoot = { name: "all-inactive-root" } as any;
    const prepareMasonry = vi.fn(async () => ({
      renderers: [masonryRenderer],
      extraMaterials: new Map([[masonryRenderer, [masonryMat]]]),
      dispose: disposeMasonry
    }));
    const prepareAnimal = vi.fn(async () => ({
      renderers: [animalRenderer],
      extraMaterials: new Map([[animalRenderer, [animalMat]]]),
      dispose: disposeAnimal
    }));
    const prepareVegetation = vi.fn(() => ({
      renderers: [vegRenderer],
      dispose: disposeVeg
    }));
    const prepareRockGrass = vi.fn(() => ({
      renderers: [rockGrassRenderer],
      dispose: disposeRockGrass
    }));
    const collectVariants = vi.fn(() => []);
    const warmupVariants = vi.fn(async () => ({
      requested: 0,
      compiled: 0,
      skipped: false,
      issues: [],
      elapsedMilliseconds: 0,
      longestVariantMilliseconds: 0,
      parallelCompileSupported: false
    }));
    const result = await runSeedWorldStartupShaderWarmup({
      precompileShaders: true,
      engine: {} as any,
      scene: { rootEntities: [] } as any,
      camera: { enabled: true } as any,
      pageUrl: new URL("http://localhost/?view=3d"),
      canvas: { dataset: {} } as any,
      showAssistant: false,
      isDisposed: () => false,
      progress: () => {},
      timed: (_name, work) => work(),
      deferSecondaryCollection: true,
      includeMasonryDither: false,
      precompileCoreMasonry: true,
      prepareMasonryShaderWarmup: prepareMasonry,
      prepareAnimalShaderWarmup: prepareAnimal,
      prepareVegetationShaderWarmup: prepareVegetation,
      prepareRockGrassShaderWarmup: prepareRockGrass,
      prepareAssistantPresentation: () => undefined,
      getIncludeInactiveRoots: () => [deferredInactiveRoot],
      getPostProcessWarmupState: () => ({ enabled: false }) as any,
      additionalBackgroundMaterials: [],
      warmupOperations: {
        hasParallelShaderCompile: () => false,
        collectSeedWorldRendererVariants: collectVariants as any,
        findMissingSeedWorldShaderVariants: () => [],
        warmupSeedWorldShaderVariants: warmupVariants as any
      }
    });
    // Pre-reveal startup only prepares core masonry + zero-network rock grass; distant animals,
    // unmaterialized vegetation species, and non-spawn inactive roots stay deferred.
    expect(prepareMasonry).toHaveBeenCalledOnce();
    expect(prepareRockGrass).toHaveBeenCalledOnce();
    expect(prepareAnimal).not.toHaveBeenCalled();
    expect(prepareVegetation).not.toHaveBeenCalled();
    expect(collectVariants).toHaveBeenCalledOnce();
    const opts = collectVariants.mock.calls[0][4] as any;
    expect(opts.includeInactiveRoots).toBeUndefined();
    expect(opts.additionalRenderers).toEqual([masonryRenderer, rockGrassRenderer]);
    expect(opts.additionalInstancedRenderers).toBeUndefined();
    expect(opts.additionalRendererMaterials.get(masonryRenderer)).toEqual([masonryMat]);
    expect(opts.additionalRendererMaterials.has(animalRenderer)).toBe(false);
    expect(disposeMasonry).toHaveBeenCalledOnce();
    expect(disposeRockGrass).toHaveBeenCalledOnce();
    expect(disposeAnimal).not.toHaveBeenCalled();
    expect(disposeVeg).not.toHaveBeenCalled();

    // Post-reveal collection prepares distant animals, unmaterialized vegetation, and inactive roots.
    await result.collectDeferredVariants!();
    expect(prepareMasonry).toHaveBeenCalledOnce();
    expect(prepareRockGrass).toHaveBeenCalledOnce();
    expect(prepareAnimal).toHaveBeenCalledOnce();
    expect(prepareVegetation).toHaveBeenCalledOnce();
    expect(collectVariants).toHaveBeenCalledTimes(2);
    const deferredOpts = collectVariants.mock.calls[1][4] as any;
    expect(deferredOpts.includeInactiveRoots).toEqual([deferredInactiveRoot]);
    expect(deferredOpts.additionalRenderers).toEqual([animalRenderer]);
    expect(deferredOpts.additionalInstancedRenderers).toEqual([vegRenderer]);
    expect(deferredOpts.additionalRendererMaterials.get(animalRenderer)).toEqual([animalMat]);
    expect(disposeAnimal).toHaveBeenCalledOnce();
    expect(disposeVeg).toHaveBeenCalledOnce();
  });

  it("throttles engine vSyncCount during active shader warmup and restores it via onWarmupPhaseChange or fallback", async () => {
    const engine = { vSyncCount: 1 } as any;
    let seenVSyncDuringWarmup = -1;
    await runSeedWorldStartupShaderWarmup({
      precompileShaders: true,
      engine,
      scene: { rootEntities: [] } as any,
      camera: { enabled: true } as any,
      pageUrl: new URL("http://localhost/?view=3d"),
      canvas: { dataset: {} } as any,
      showAssistant: false,
      isDisposed: () => false,
      progress: () => {},
      timed: (_name, work) => work(),
      prepareAssistantPresentation: () => undefined,
      getPostProcessWarmupState: () => ({ enabled: false }) as any,
      additionalBackgroundMaterials: [],
      warmupOperations: {
        hasParallelShaderCompile: () => true,
        collectSeedWorldRendererVariants: () => [],
        findMissingSeedWorldShaderVariants: () => [],
        warmupSeedWorldShaderVariants: async () => {
          seenVSyncDuringWarmup = engine.vSyncCount;
          return {
            requested: 0,
            compiled: 0,
            skipped: false,
            issues: [],
            elapsedMilliseconds: 0,
            longestVariantMilliseconds: 0,
            parallelCompileSupported: true
          };
        }
      }
    });
    expect(seenVSyncDuringWarmup).toBe(4);
    expect(engine.vSyncCount).toBe(1);

    const phases: boolean[] = [];
    await expect(
      runSeedWorldStartupShaderWarmup({
        precompileShaders: true,
        engine,
        scene: { rootEntities: [] } as any,
        camera: { enabled: true } as any,
        pageUrl: new URL("http://localhost/?view=3d"),
        canvas: { dataset: {} } as any,
        showAssistant: false,
        isDisposed: () => false,
        progress: () => {},
        timed: (_name, work) => work(),
        prepareAssistantPresentation: () => undefined,
        getPostProcessWarmupState: () => ({ enabled: false }) as any,
        additionalBackgroundMaterials: [],
        onWarmupPhaseChange: (active) => phases.push(active),
        warmupOperations: {
          hasParallelShaderCompile: () => true,
          collectSeedWorldRendererVariants: () => [],
          findMissingSeedWorldShaderVariants: () => [],
          warmupSeedWorldShaderVariants: async () => {
            expect(engine.vSyncCount).toBe(1);
            throw new Error("warmup failure");
          }
        }
      })
    ).rejects.toThrow("warmup failure");
    expect(phases).toEqual([true, false]);
    expect(engine.vSyncCount).toBe(1);
  });

  it("disposes fulfilled deferred warmup handles when a sibling prepare promise rejects before or after sibling settlement", async () => {
    const runScenario = async (resolveSiblingAfterReject: boolean) => {
      const disposeAnimal = vi.fn();
      let resolveAnimal!: (value: { renderers: any[]; dispose: () => void }) => void;
      const animalPromise = resolveSiblingAfterReject
        ? new Promise<{ renderers: any[]; dispose: () => void }>((resolve) => {
            resolveAnimal = resolve;
          })
        : Promise.resolve({ renderers: [], dispose: disposeAnimal });

      const result = await runSeedWorldStartupShaderWarmup({
        precompileShaders: true,
        engine: {} as any,
        scene: { rootEntities: [] } as any,
        camera: { enabled: true } as any,
        pageUrl: new URL("http://localhost/?view=3d"),
        canvas: { dataset: {} } as any,
        showAssistant: false,
        isDisposed: () => false,
        progress: () => {},
        timed: (_name, work) => work(),
        deferSecondaryCollection: true,
        precompileCoreMasonry: false,
        prepareMasonryShaderWarmup: () => Promise.reject(new Error("masonry prep failed")),
        prepareAnimalShaderWarmup: () => animalPromise,
        prepareAssistantPresentation: () => undefined,
        getPostProcessWarmupState: () => ({ enabled: false }) as any,
        additionalBackgroundMaterials: [],
        warmupOperations: {
          hasParallelShaderCompile: () => false,
          collectSeedWorldRendererVariants: () => [],
          findMissingSeedWorldShaderVariants: () => [],
          warmupSeedWorldShaderVariants: async () => ({
            requested: 0,
            compiled: 0,
            skipped: false,
            issues: [],
            elapsedMilliseconds: 0,
            longestVariantMilliseconds: 0,
            parallelCompileSupported: false
          })
        }
      });

      await expect(result.collectDeferredVariants!()).rejects.toThrow("masonry prep failed");
      if (resolveSiblingAfterReject) {
        resolveAnimal({ renderers: [], dispose: disposeAnimal });
        await Promise.resolve();
        await Promise.resolve();
      }
      expect(disposeAnimal).toHaveBeenCalledOnce();
    };

    await runScenario(false);
    await runScenario(true);
  });

  it("skips distant unloaded animal GLB downloads when PlanningAnimalRuntime.prepareShaderWarmup sets includeUnloadedSpecies=false", async () => {
    const { PlanningAnimalRuntime } = await import(
      "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalRuntime"
    );
    const loadSpy = vi.fn(async () => {
      throw new Error("should not download distant animal GLB");
    });
    const loadedRenderer = { name: "loaded-rabbit" } as any;
    const altMat = { name: "loaded-rabbit-plain" } as any;
    const fakeRuntime = {
      disposed: false,
      library: { load: loadSpy },
      population: {
        actors: [
          {
            state: "loaded",
            supportValid: true,
            asset: { config: { id: "rabbit" }, reference: { url: "/rabbit.glb" } },
            animal: {
              collectShaderWarmupMaterials: (out: Map<unknown, unknown[]>) => {
                out.set(loadedRenderer, [altMat]);
              }
            }
          },
          {
            state: "unloaded",
            supportValid: true,
            asset: { config: { id: "distant-deer" }, reference: { url: "/deer.glb" } }
          }
        ]
      }
    };
    const handle = await PlanningAnimalRuntime.prototype.prepareShaderWarmup.call(fakeRuntime as any, undefined, {
      includeUnloadedSpecies: false
    });
    expect(loadSpy).not.toHaveBeenCalled();
    expect(handle?.renderers).toEqual([]);
    expect(handle?.extraMaterials.get(loadedRenderer)).toEqual([altMat]);
    handle?.dispose();
  });

  it("ShaderPass._getShaderProgram honors deferCompletionOverride=true even when feedbackVaryings array is passed", async () => {
    const { ShaderPass } = await import("@galacean/engine");
    const ensureReady = vi.fn();
    const compiledProgram = { _ensureReady: ensureReady };
    const compileSpy = vi.fn(() => compiledProgram);
    const fakeMap = {
      get: () => undefined,
      cache: vi.fn()
    };
    const fakePass = {
      _shaderPassId: 1,
      _shaderProgramMaps: [],
      _feedbackVaryings: undefined,
      _compileShaderProgram: compileSpy
    };
    const fakeEngine = {
      _getShaderProgramMap: () => fakeMap
    } as any;
    const varyings = ["v_FeedbackPosition", "v_FeedbackVelocity"];
    const result = ShaderPass.prototype._getShaderProgram.call(
      fakePass as any,
      fakeEngine,
      new ShaderMacroCollection(),
      varyings,
      false,
      true
    );
    expect(result).toBe(compiledProgram);
    expect(compileSpy).toHaveBeenCalledWith(fakeEngine, expect.any(ShaderMacroCollection), true, false, varyings);
    expect(ensureReady).not.toHaveBeenCalled();
  });

  it("defers offscreen and non-wanted animal GLB loads during startup until setStartupDeferOffscreenCamera(undefined) is called", async () => {
    const { Matrix, Vector3 } = await import("@galacean/engine");
    const { PlanningAnimalRuntime } = await import(
      "../../demos/seed-world/src/planning/spatial/runtime/PlanningAnimalRuntime"
    );
    const loadedIds: string[] = [];
    const proj = new Matrix();
    Matrix.perspective(Math.PI / 3, 1, 0.1, 200, proj);
    const view = new Matrix();
    Matrix.lookAt(new Vector3(0, 2, 0), new Vector3(0, 2, -20), new Vector3(0, 1, 0), view);
    const camera = { projectionMatrix: proj, viewMatrix: view } as any;

    const visibleActor = {
      birth: { id: "squirrel-front" },
      wanted: true,
      admitted: true,
      x: 0,
      z: -20,
      footprint: { radius: 0.4, height: 0.5, elevation: 0 }
    };
    const behindActor = {
      birth: { id: "gorilla-behind" },
      wanted: true,
      admitted: true,
      x: 0,
      z: 30,
      footprint: { radius: 0.8, height: 1.5, elevation: 0 }
    };
    const bufferActor = {
      birth: { id: "swan-buffer" },
      wanted: false,
      admitted: true,
      x: 0,
      z: -35,
      footprint: { radius: 0.5, height: 0.8, elevation: 0 }
    };
    const queue = new Set<any>([visibleActor, behindActor, bufferActor]);
    const fakeRuntime = {
      startupDeferOffscreenCamera: undefined as any,
      startupFrustumMatrix: new Matrix(),
      startupFrustum: new (await import("@galacean/engine")).BoundingFrustum(),
      startupActorBox: new (await import("@galacean/engine")).BoundingBox(),
      loadActor: (_p: unknown, actor: any) => {
        loadedIds.push(actor.birth.id);
        queue.delete(actor);
      }
    };

    PlanningAnimalRuntime.prototype.setStartupDeferOffscreenCamera.call(fakeRuntime as any, camera);
    (PlanningAnimalRuntime.prototype as any).loadQueued.call(fakeRuntime, { queue });
    expect(loadedIds).toEqual(["squirrel-front"]);
    expect(queue.has(behindActor)).toBe(true);
    expect(queue.has(bufferActor)).toBe(true);

    // Clearing the startup deferral camera immediately drains the deferred offscreen/buffer actors.
    PlanningAnimalRuntime.prototype.setStartupDeferOffscreenCamera.call(fakeRuntime as any, undefined);
    (PlanningAnimalRuntime.prototype as any).loadQueued.call(fakeRuntime, { queue });
    expect(loadedIds).toEqual(["squirrel-front", "gorilla-behind", "swan-buffer"]);
    expect(queue.size).toBe(0);
  });

  it("defers offscreen StorageContainerPresenter prefab fetches during startup and loads on approach", async () => {
    const { Vector3 } = await import("@galacean/engine");
    const { StorageContainerPresenter } = await import(
      "@galacean/engine-farming/farming/presentation/storage/StorageContainerPresenter"
    );
    const { HeadlessEngine } = await import("../../../packages/rhi-null/src/HeadlessEngine");
    const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
    try {
      const parent = engine.sceneManager.activeScene!.createRootEntity("StorageParent");
      const loadSpy = vi.spyOn(engine.resourceManager, "load").mockImplementation(() => new Promise(() => {}) as any);
      const viewerPos = new Vector3(0, 0, 0);
      const fakeService = {
        getSnapshot: () => ({
          farmId: "farm-1",
          storage: {
            containers: [
              { id: "cart-1", typeId: "cart", position: [120, 0, 0], yaw: 0, cropId: null, contents: [] }
            ]
          }
        }),
        subscribe: () => () => {}
      } as any;
      const fakeDefs = {
        catalog: { crops: [] },
        rules: { storage: { containers: [] } }
      } as any;
      const presenter = new StorageContainerPresenter(
        parent,
        fakeService,
        fakeDefs,
        () => viewerPos,
        true,
        () => false
      );

      // Distant offscreen container (> 50m): prepare() resolves immediately with zero prefab loads.
      await presenter.prepare();
      expect(loadSpy).not.toHaveBeenCalled();

      // Release startup deferral while still > 50m away: still stays unloaded until player approaches.
      presenter.setDeferOffscreenLoad(false);
      presenter.update(0.016);
      expect(loadSpy).not.toHaveBeenCalled();

      // Player walks within 50m draw distance: update() kicks off prefab loads automatically.
      viewerPos.set(100, 0, 0);
      presenter.update(0.016);
      expect(loadSpy).toHaveBeenCalledTimes(2);
      presenter.dispose();
    } finally {
      engine.destroy();
    }
  });

  it("defers offscreen FarmItemPresentation tool prefabs (hoe, watering-can) at startup and loads lazily on approach or pickup", async () => {
    const { Vector3 } = await import("@galacean/engine");
    const { FarmItemPresentation } = await import(
      "@galacean/engine-farming/farming/presentation/FarmItemPresentation"
    );
    const { HeadlessEngine } = await import("../../../packages/rhi-null/src/HeadlessEngine");
    const engine = await HeadlessEngine.create({ glTFLoader: { meshOpt: { workerCount: 0 } } });
    try {
      const scene = engine.sceneManager.activeScene!;
      const root = scene.createRootEntity("FarmRoot");
      const cameraEntity = scene.createRootEntity("Cam");
      cameraEntity.transform.setWorldPosition(0, 2, 0);
      const camera = { entity: cameraEntity, aspectRatio: 1 } as any;
      let carriedItemId: string | null = null;
      let listener: (() => void) | undefined;
      const itemsState = {
        get carriedItemId() {
          return carriedItemId;
        },
        instances: [
          { id: "hoe-1", type: "hoe" as const, groundId: "g", position: [140, 0, 0] as const, yaw: 0, contents: [] },
          {
            id: "can-1",
            type: "watering-can" as const,
            groundId: "g",
            position: [142, 0, 0] as const,
            yaw: 0,
            contents: []
          }
        ]
      };
      const service = {
        getSnapshot: () => ({ items: itemsState }),
        subscribe: (cb: () => void) => {
          listener = cb;
          return () => {
            listener = undefined;
          };
        }
      } as any;
      const loadSpy = vi.spyOn(engine.resourceManager, "load").mockImplementation(() => new Promise(() => {}) as any);
      const presentation = new FarmItemPresentation(root, camera, service, {}, async (w) => w(), true);

      // Distant (>50m) tools do not load pre-reveal and whenLoaded() resolves immediately.
      await presentation.whenLoaded();
      expect(loadSpy).not.toHaveBeenCalled();

      // Releasing startup deferral while still >50m away keeps distant tools unloaded.
      presentation.setDeferOffscreenLoads(false);
      presentation.update(0.016);
      expect(loadSpy).not.toHaveBeenCalled();

      // Walking within 50m triggers lazy load of both nearby tools.
      cameraEntity.transform.setWorldPosition(110, 2, 0);
      presentation.update(0.016);
      expect(loadSpy).toHaveBeenCalledTimes(2);
      expect(loadSpy.mock.calls.map(([req]) => (req as { url: string }).url)).toEqual([
        "Farming/Props/Tilling/hoe.prefab",
        "Farming/Props/Watering/watering-can.prefab"
      ]);
      void listener;
      presentation.dispose();
    } finally {
      engine.destroy();
    }
  });

  it("defers CRUD-only deferredBackgroundMaterials out of primary warmup even when parallelCompile is true and retains them in post-ready secondary collection", async () => {
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
    const holoMat = fakeMaterial("SeedWorld/HologramRainbow");
    const holoAddMat = fakeMaterial("SeedWorld/HologramRainbowAdditive");
    const engine = {
      _macroCollection: new ShaderMacroCollection(),
      _hardwareRenderer: { supportsRendering: true },
      _basicResources: {}
    } as any;
    const scene = {
      rootEntities: [],
      background: { mode: 0 },
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    } as any;
    const camera = {
      enabled: true,
      enablePostProcess: false,
      renderTarget: null,
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      _updateShaderData: vi.fn(),
      _isIndependentCanvasEnabled: () => false
    } as any;
    let primaryWarmed: readonly { shader: string }[] = [];
    const result = await runSeedWorldStartupShaderWarmup({
      precompileShaders: true,
      engine,
      scene,
      camera,
      pageUrl: new URL("http://localhost/?view=3d"),
      canvas: { dataset: {} } as any,
      showAssistant: false,
      deferSecondaryCollection: true,
      isDisposed: () => false,
      progress: () => {},
      timed: (_name, work) => work(),
      prepareAssistantPresentation: () => undefined,
      getPostProcessWarmupState: () => ({ enabled: false }) as any,
      additionalBackgroundMaterials: [],
      deferredBackgroundMaterials: [holoMat, holoAddMat],
      warmupOperations: {
        hasParallelShaderCompile: () => true,
        collectSeedWorldRendererVariants,
        findMissingSeedWorldShaderVariants,
        warmupSeedWorldShaderVariants: async (_engine, variants) => {
          primaryWarmed = variants;
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
    expect(primaryWarmed.some((v) => v.shader.startsWith("SeedWorld/HologramRainbow"))).toBe(false);
    const secondary = await result.collectDeferredVariants!();
    expect(secondary.map((v) => v.shader)).toEqual([
      "SeedWorld/HologramRainbow",
      "SeedWorld/HologramRainbowAdditive"
    ]);
  });

  it("runs a delta catch-up warmup before reveal when getDynamicPresentationRevision advances mid-warmup (Mac #151 revMiss=1 regression)", async () => {
    let revision = 1;
    const initialMasonry = {
      shader: "Masonry/4b8047e4d4624c972736f5d4f6a7813c992d52e6c497d47cb9db2a5323147f2f",
      si: 0,
      pi: 0,
      macros: [{ n: "RENDERER_MASONRY_ENTRANCE" }]
    };
    const lateMasonry = {
      shader: "Masonry/f393f98f4ca60147bc40da9746d99acb906ce913414fdafe28b981467c01c539",
      si: 0,
      pi: 0,
      macros: [{ n: "RENDERER_MASONRY_ENTRANCE" }]
    };
    const lateMasonrySteady = {
      shader: lateMasonry.shader,
      si: 0,
      pi: 0,
      macros: []
    };
    const otherSecondary = {
      shader: "Terrain/Vegetation",
      si: 0,
      pi: 0,
      macros: []
    };
    const warmedBatches: Array<readonly { shader: string }[]> = [];
    const collectVariants = vi.fn((_e, _s, _c, _r, opts: any) => {
      if (opts?.onlyEnabledRenderers) {
        return revision === 1 ? [initialMasonry] : [initialMasonry, lateMasonry];
      }
      return [initialMasonry, lateMasonry, otherSecondary, lateMasonrySteady];
    });
    const result = await runSeedWorldStartupShaderWarmup({
      precompileShaders: true,
      engine: {} as any,
      scene: { rootEntities: [] } as any,
      camera: { enabled: true } as any,
      pageUrl: new URL("http://localhost/?view=3d"),
      canvas: { dataset: {} } as any,
      showAssistant: false,
      deferSecondaryCollection: true,
      isDisposed: () => false,
      progress: () => {},
      timed: (_name, work) => work(),
      prepareAssistantPresentation: () => undefined,
      getPostProcessWarmupState: () => ({ enabled: false }) as any,
      additionalBackgroundMaterials: [],
      getDynamicPresentationRevision: () => revision,
      warmupOperations: {
        hasParallelShaderCompile: () => true,
        collectSeedWorldRendererVariants: collectVariants as any,
        findMissingSeedWorldShaderVariants,
        warmupSeedWorldShaderVariants: async (_engine, variants) => {
          warmedBatches.push(variants);
          // Simulate BuildingRuntime.pumpDetailQueue committing a new LOD0 building mid-warmup.
          if (warmedBatches.length === 1) revision = 2;
          return {
            requested: variants.length,
            compiled: variants.length,
            parallelCompileSupported: true,
            deferred: [],
            issues: [],
            elapsedMilliseconds: 2,
            longestVariantMilliseconds: 2
          };
        }
      }
    });

    expect(warmedBatches).toHaveLength(2);
    expect(warmedBatches[0]!.map((v) => v.shader)).toEqual([initialMasonry.shader]);
    expect(warmedBatches[1]!.map((v) => v.shader)).toEqual([lateMasonry.shader]);
    expect(result.report?.requested).toBe(2);
    expect(result.report?.compiled).toBe(2);
    // Secondary collection does not duplicate the late-caught entrance variant and promotes its steady-state twin first.
    const secondary = await result.collectDeferredVariants!();
    expect(secondary.map((v) => v.shader)).toEqual([lateMasonrySteady.shader, otherSecondary.shader]);
  });

  it("awaits prepareMasonryPresentation before collecting primary shader variants so spawn-close LOD0 buildings never miss reveal", async () => {
    const masonryReady = deferred();
    const order: string[] = [];
    const collectVariants = vi.fn(() => {
      order.push("collect");
      return [];
    });
    const task = runSeedWorldStartupShaderWarmup({
      precompileShaders: true,
      engine: {} as any,
      scene: { rootEntities: [] } as any,
      camera: { enabled: true } as any,
      pageUrl: new URL("http://localhost/?view=3d"),
      canvas: { dataset: {} } as any,
      showAssistant: false,
      deferSecondaryCollection: true,
      precompileCoreMasonry: false,
      isDisposed: () => false,
      progress: () => {},
      timed: (_name, work) => work(),
      prepareMasonryPresentation: async () => {
        await masonryReady.promise;
        order.push("masonry-flushed");
      },
      prepareAssistantPresentation: () => undefined,
      getPostProcessWarmupState: () => ({ enabled: false }) as any,
      additionalBackgroundMaterials: [],
      warmupOperations: {
        hasParallelShaderCompile: () => true,
        collectSeedWorldRendererVariants: collectVariants as any,
        findMissingSeedWorldShaderVariants,
        warmupSeedWorldShaderVariants: async () => ({
          requested: 0,
          compiled: 0,
          parallelCompileSupported: true,
          deferred: [],
          issues: [],
          elapsedMilliseconds: 0,
          longestVariantMilliseconds: 0
        })
      }
    });
    await Promise.resolve();
    expect(collectVariants).not.toHaveBeenCalled();
    masonryReady.resolve();
    await task;
    expect(order).toEqual(["masonry-flushed", "collect"]);
  });
});
