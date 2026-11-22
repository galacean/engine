import { Camera, Engine, Entity, Material, PipelineStage, Renderer, Scene, Shader } from "@galacean/engine";
import {
  collectSeedWorldRendererVariants,
  findMissingSeedWorldShaderVariants,
  hasParallelShaderCompile,
  warmupSeedWorldRendererVariants,
  warmupSeedWorldShaderVariants,
  withSeedWorldGenerationRevealVariants,
  type SeedWorldRendererWarmupOptions,
  type SeedWorldShaderVariantEntry,
  type SeedWorldShaderWarmupReport
} from "@galacean/engine-world-planning/world/SeedWorldShaderWarmup";

export interface SeedWorldMasonryShaderWarmupHandle {
  readonly renderers?: readonly Renderer[];
  readonly extraMaterials?: ReadonlyMap<Renderer, readonly Material[]>;
  readonly decorationPointLightBudget?: number;
  dispose(): void;
}

export interface SeedWorldAnimalShaderWarmupHandle {
  readonly renderers?: readonly Renderer[];
  readonly extraMaterials?: ReadonlyMap<Renderer, readonly Material[]>;
  dispose(): void;
}

export interface SeedWorldVegetationShaderWarmupHandle {
  readonly renderers: readonly Renderer[];
  dispose(): void;
}

export interface SeedWorldPrimaryVegetationShaderWarmupHandle {
  readonly renderers: readonly Renderer[];
  readonly cameraOnlyRenderers: readonly Renderer[];
  readonly shadowOnlyRenderers: readonly Renderer[];
  dispose(): void;
}

export interface SeedWorldStartupShaderWarmupDeps {
  readonly precompileShaders: boolean;
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly pageUrl: URL;
  readonly canvas: HTMLCanvasElement;
  readonly showAssistant: boolean;
  readonly isDisposed: () => boolean;
  readonly lifetimeSignal?: AbortSignal;
  readonly progress: (value: number, stage: string) => void;
  readonly timed: <T>(name: string, work: () => T) => T;
  readonly prepareFarmingPresentation?: () => Promise<unknown> | unknown;
  readonly prepareAnimalPresentation?: () => Promise<unknown> | unknown;
  readonly prepareAnimalShaderWarmup?: (
    signal: AbortSignal
  ) => Promise<SeedWorldAnimalShaderWarmupHandle | undefined> | undefined;
  readonly prepareVegetationPresentation?: () => Promise<unknown> | unknown;
  readonly preparePrimaryVegetationShaderWarmup?: () => SeedWorldPrimaryVegetationShaderWarmupHandle | undefined;
  readonly prepareVegetationShaderWarmup?: () => SeedWorldVegetationShaderWarmupHandle | undefined;
  readonly prepareRockGrassShaderWarmup?: () => SeedWorldVegetationShaderWarmupHandle | undefined;
  readonly prepareMasonryShaderWarmup?: (
    signal: AbortSignal
  ) => Promise<SeedWorldMasonryShaderWarmupHandle | undefined> | undefined;
  readonly prepareAssistantPresentation: () => { readonly root: Entity } | undefined;
  readonly getIncludeInactiveRoots?: () => readonly Entity[];
  /** Optional small set of inactive roots (e.g. distance-culled village farm props) to warm in primary parallel startup. */
  readonly getPrimaryIncludeInactiveRoots?: () => readonly Entity[];
  readonly hasOpaqueScreenSpaceReflection?: () => boolean;
  /** Whether to expand masonry shaders with Bayer LOD cross-fade dither variants. Defaults to true. */
  readonly includeMasonryDither?: boolean;
  /**
   * When true, prepare and compile core non-dither masonry LOD0/LOD1 variants during startup
   * (even on synchronous Android GPUs without KHR_parallel_shader_compile) so immediate village
   * walks never hitch on masonry compilation.
   */
  readonly precompileCoreMasonry?: boolean;
  /**
   * When true and KHR_parallel_shader_compile is available, prepare and compile core non-dither
   * masonry LOD0/LOD1 variants in parallel during startup so immediate village walks never hitch.
   */
  readonly precompileCoreMasonryOnParallel?: boolean;
  readonly getPostProcessWarmupState: () => SeedWorldRendererWarmupOptions["postProcessState"];
  readonly additionalBackgroundMaterials: SeedWorldRendererWarmupOptions["additionalBackgroundMaterials"];
  /** Optional CRUD-only effect materials compiled upfront when parallel shader compile is available,
   * or deferred to post-ready idle warmup on synchronous (`parallel=false`) mobile GPUs. */
  readonly deferredBackgroundMaterials?: SeedWorldRendererWarmupOptions["additionalBackgroundMaterials"];
  /**
   * When true (production startup), defer preparing offscreen secondary handles (masonry LOD0/1,
   * unmaterialized vegetation species, rock grass, assistant HUD) and collecting `allVariants`
   * until `collectDeferredVariants()` is invoked after first-screen reveal.
   */
  readonly deferSecondaryCollection?: boolean;
  readonly onWarmupEvent?: (message: string, detail: string) => void;
  readonly warmupOperations?: {
    readonly hasParallelShaderCompile?: typeof hasParallelShaderCompile;
    readonly collectSeedWorldRendererVariants?: typeof collectSeedWorldRendererVariants;
    readonly findMissingSeedWorldShaderVariants?: typeof findMissingSeedWorldShaderVariants;
    readonly warmupSeedWorldRendererVariants?: typeof warmupSeedWorldRendererVariants;
    readonly warmupSeedWorldShaderVariants?: typeof warmupSeedWorldShaderVariants;
  };
}

export interface SeedWorldStartupShaderWarmupResult {
  readonly report?: SeedWorldShaderWarmupReport;
  readonly deferredShaderVariants: readonly SeedWorldShaderVariantEntry[];
  readonly collectDeferredVariants?: () => Promise<readonly SeedWorldShaderVariantEntry[]>;
  readonly ssrVerifyReceiverDepth?: boolean;
}

const MASONRY_ENTRANCE_MACROS = new Set(["RENDERER_MASONRY_ENTRANCE", "GLOBAL_PROXY_ENTRANCE"]);

function hasMasonryEntranceMacro(entry: SeedWorldShaderVariantEntry): boolean {
  const macros = entry.macros;
  if (!macros) return false;
  for (let i = 0; i < macros.length; i++) {
    if (MASONRY_ENTRANCE_MACROS.has(macros[i]!.n)) return true;
  }
  return false;
}

function variantKeyWithoutMasonryEntrance(entry: SeedWorldShaderVariantEntry): string {
  const parts: string[] = [];
  const macros = entry.macros ?? [];
  for (let i = 0; i < macros.length; i++) {
    const m = macros[i]!;
    if (MASONRY_ENTRANCE_MACROS.has(m.n)) continue;
    parts.push(m.v === undefined ? m.n : `${m.n}=${m.v}`);
  }
  parts.sort();
  return `${entry.shader}|${entry.si}|${entry.pi}|${parts.join(",")}`;
}

function isForwardShaderVariant(entry: SeedWorldShaderVariantEntry): boolean {
  const pass = Shader.find?.(entry.shader)?.subShaders?.[entry.si]?.passes?.[entry.pi];
  const stage = pass?.getTagValue?.("pipelineStage");
  if (stage !== undefined) {
    return stage === PipelineStage.Forward;
  }
  return entry.pi === 0;
}

function isShadowCasterShaderVariant(entry: SeedWorldShaderVariantEntry): boolean {
  const pass = Shader.find?.(entry.shader)?.subShaders?.[entry.si]?.passes?.[entry.pi];
  const stage = pass?.getTagValue?.("pipelineStage");
  if (stage !== undefined) {
    return stage === PipelineStage.ShadowCaster;
  }
  return entry.shader === "Masonry/GlobalProxy" && entry.pi === 0;
}

function startupShaderVariantPriority(entry: SeedWorldShaderVariantEntry): number {
  const s = entry.shader;
  if (
    s.startsWith("Sky/") ||
    s === "World/VolumetricClouds" ||
    s.startsWith("PostProcess/") ||
    s.startsWith("Blit/") ||
    s.startsWith("2D/") ||
    s.startsWith("SeedWorld/")
  ) {
    return 0;
  }
  const isForward = isForwardShaderVariant(entry);
  if (
    s === "Terrain/Terrain" ||
    s === "Terrain/Grass" ||
    s.startsWith("Water/") ||
    s.startsWith("WaterFar/") ||
    s.startsWith("AIWorld/")
  )
    return isForward ? 1 : 3;
  if (s === "Terrain/Vegetation" || s === "Terrain/Surface") return isForward ? 2 : 4;
  if (s.startsWith("Masonry/")) return isForward ? 3 : 5;
  return isForward ? 4 : 6;
}

function mergeExtraMaterials(
  ...sources: readonly (ReadonlyMap<Renderer, readonly Material[]> | undefined)[]
): Map<Renderer, readonly Material[]> | undefined {
  let merged: Map<Renderer, Material[]> | undefined;
  for (const source of sources) {
    if (!source || source.size === 0) continue;
    merged ??= new Map<Renderer, Material[]>();
    for (const [renderer, materials] of source) {
      let list = merged.get(renderer);
      if (!list) {
        list = [];
        merged.set(renderer, list);
      }
      for (const material of materials) {
        if (!list.includes(material)) list.push(material);
      }
    }
  }
  return merged;
}

export async function runSeedWorldStartupShaderWarmup(
  deps: SeedWorldStartupShaderWarmupDeps
): Promise<SeedWorldStartupShaderWarmupResult> {
  if (!deps.precompileShaders) {
    return { deferredShaderVariants: [], ssrVerifyReceiverDepth: false };
  }
  const ops = {
    hasParallelShaderCompile: deps.warmupOperations?.hasParallelShaderCompile ?? hasParallelShaderCompile,
    collectSeedWorldRendererVariants:
      deps.warmupOperations?.collectSeedWorldRendererVariants ?? collectSeedWorldRendererVariants,
    findMissingSeedWorldShaderVariants:
      deps.warmupOperations?.findMissingSeedWorldShaderVariants ?? findMissingSeedWorldShaderVariants,
    warmupSeedWorldRendererVariants:
      deps.warmupOperations?.warmupSeedWorldRendererVariants ?? warmupSeedWorldRendererVariants,
    warmupSeedWorldShaderVariants: deps.warmupOperations?.warmupSeedWorldShaderVariants ?? warmupSeedWorldShaderVariants
  };

  // Keep world draws disabled until reveal.
  deps.camera.enabled = false;
  deps.progress(0.96, "准备世界渲染资源");
  let masonryWarmup: SeedWorldMasonryShaderWarmupHandle | undefined;
  let animalWarmup: SeedWorldAnimalShaderWarmupHandle | undefined;
  let vegetationWarmup: SeedWorldVegetationShaderWarmupHandle | undefined;
  let rockGrassWarmup: SeedWorldVegetationShaderWarmupHandle | undefined;
  const prepAbort = new AbortController();
  const onLifetimeAbort = () => prepAbort.abort(deps.lifetimeSignal?.reason);
  if (deps.lifetimeSignal?.aborted) prepAbort.abort(deps.lifetimeSignal.reason);
  else deps.lifetimeSignal?.addEventListener("abort", onLifetimeAbort, { once: true });
  let prepCleanedUp = false;
  let deferredShaderVariants: SeedWorldShaderVariantEntry[] = [];
  let collectDeferredVariants: (() => Promise<readonly SeedWorldShaderVariantEntry[]>) | undefined;
  let ssrVerifyReceiverDepth = false;
  let shaderWarmup: SeedWorldShaderWarmupReport;
  const agentTraceEnabled = deps.pageUrl.searchParams.get("agentTrace") === "1";
  const deferSecondary = !agentTraceEnabled;
  const deferSecondaryPrep = deferSecondary && Boolean(deps.deferSecondaryCollection);
  const parallelCompile = ops.hasParallelShaderCompile(deps.engine);
  const precompileCoreMasonry =
    Boolean(deps.precompileCoreMasonry) || (Boolean(deps.precompileCoreMasonryOnParallel) && parallelCompile);
  const prepareMasonryInStartup = !deferSecondaryPrep || precompileCoreMasonry;
  const includeMasonryDither = deps.includeMasonryDither ?? true;
  try {
    await deps.timed(
      prepareMasonryInStartup
        ? "preparePresentation (farming + animals + vegetation + masonry)"
        : "preparePresentation (farming + animals + vegetation)",
      () =>
        Promise.all([
          deps.prepareFarmingPresentation?.(),
          Promise.resolve(deps.prepareAnimalPresentation?.()).then(async () => {
            if (!prepareMasonryInStartup || prepCleanedUp || prepAbort.signal.aborted) return;
            const prepared = await deps.prepareAnimalShaderWarmup?.(prepAbort.signal);
            if (!prepared) return;
            if (prepCleanedUp) prepared.dispose();
            else animalWarmup = prepared;
          }),
          deps.prepareVegetationPresentation?.(),
          ...(prepareMasonryInStartup
            ? [
                deps.prepareMasonryShaderWarmup?.(prepAbort.signal)?.then((prepared) => {
                  if (!prepared) return;
                  if (prepCleanedUp) prepared.dispose();
                  else masonryWarmup = prepared;
                })
              ]
            : [])
        ])
    );
    if (deps.isDisposed()) {
      throw new DOMException("Seed page disposed during shader preparation", "AbortError");
    }
    if (!deferSecondaryPrep || precompileCoreMasonry) {
      vegetationWarmup = deps.prepareVegetationShaderWarmup?.();
      rockGrassWarmup = deps.prepareRockGrassShaderWarmup?.();
    }
    deps.progress(0.98, "预编译场景渲染变体");
    const assistant = !deferSecondaryPrep && deps.showAssistant ? deps.prepareAssistantPresentation() : undefined;
    const includeInactiveRoots = deps.getIncludeInactiveRoots?.();
    const startupBackgroundMaterials =
      parallelCompile && deps.deferredBackgroundMaterials?.length
        ? [...(deps.additionalBackgroundMaterials ?? []), ...deps.deferredBackgroundMaterials]
        : deps.additionalBackgroundMaterials;
    const baseWarmupOptions = {
      strict: true,
      signal: deps.lifetimeSignal,
      includeInactiveEntities: false,
      includeInactiveRoots,
      includeGpuInstancing: true,
      onlySharedMeshGpuInstancing: true,
      includeLodDither: false,
      // CRUD-only rainbow reveal / terrain entrance wave variants are only needed for AI authoring
      // edits (or full agentTrace audits), not during normal world startup/exploration.
      includeGenerationReveal: !deferSecondary && parallelCompile,
      includeOpaqueScreenSpaceReflection: deps.hasOpaqueScreenSpaceReflection?.() ?? false,
      includeLiquidGlassMask: deps.showAssistant,
      includePhotoCopy: deps.showAssistant,
      frameBudgetMilliseconds: 32,
      maximumPendingPrograms: parallelCompile ? 16 : 1,
      overlayRenderers: assistant?.root.getComponentsIncludeChildren(Renderer, []) ?? [],
      postProcessState: deps.getPostProcessWarmupState(),
      additionalBackgroundMaterials: startupBackgroundMaterials,
      onCollectSummary: ({ hasTransparentSsr }: { readonly hasTransparentSsr: boolean }) => {
        if (hasTransparentSsr) ssrVerifyReceiverDepth = true;
      }
    } as const;
    const buildFullWarmupOptions = (handles: {
      masonry?: SeedWorldMasonryShaderWarmupHandle;
      animal?: SeedWorldAnimalShaderWarmupHandle;
      vegetation?: SeedWorldVegetationShaderWarmupHandle;
      rockGrass?: SeedWorldVegetationShaderWarmupHandle;
      overlayRenderers?: readonly Renderer[];
    }) => {
      const additionalRenderers = [
        ...(handles.masonry?.renderers ?? []),
        ...(handles.animal?.renderers ?? []),
        ...(handles.rockGrass?.renderers ?? [])
      ];
      const additionalRendererMaterials = mergeExtraMaterials(
        handles.masonry?.extraMaterials,
        handles.animal?.extraMaterials
      );
      return {
        ...baseWarmupOptions,
        ...(handles.overlayRenderers !== undefined ? { overlayRenderers: handles.overlayRenderers } : {}),
        includeGenerationReveal: !deferSecondary,
        includeMasonryDither,
        additionalRenderers: additionalRenderers.length ? additionalRenderers : undefined,
        additionalInstancedRenderers: handles.vegetation?.renderers,
        additionalRendererMaterials,
        additionalPointLightCounts: handles.masonry?.decorationPointLightBudget
          ? [handles.masonry.decorationPointLightBudget]
          : undefined
      } as const;
    };
    const collectDeferredBackgroundVariants = (): readonly SeedWorldShaderVariantEntry[] => {
      if (parallelCompile || !deps.deferredBackgroundMaterials?.length) return [];
      return ops.collectSeedWorldRendererVariants(deps.engine, deps.scene, deps.camera, [], {
        additionalBackgroundMaterials: deps.deferredBackgroundMaterials,
        postProcessState: {
          enabled: false,
          bloom: false,
          bloomHighQuality: false,
          bloomDirt: false,
          colorAdjustments: false
        },
        includeInstanceEntrance: false,
        includeMasonryEntrance: false,
        includeMasonryDither: false
      });
    };
    // Compile 100% of prioritized spawn-frame visible variants before reveal (never truncated),
    // and defer secondary template variants (offscreen renderers, offscreen masonry LOD0/LOD1,
    // unmaterialized vegetation species, SCENE_POINT_LIGHT_COUNT=4, masonry LOD dither,
    // PhotoCopy/LiquidGlassMask, mobile CRUD reveal/deferred effects) to post-reveal warmup.
    // Keep synchronous full-set warmup only when `agentTrace=1` requests full audit receipts.
    if (deferSecondary) {
      const primaryVegetationWarmup = deps.preparePrimaryVegetationShaderWarmup?.();
      const coreMasonryInPrimary = precompileCoreMasonry && Boolean(masonryWarmup);
      const primaryAdditionalRenderers = [
        ...(primaryVegetationWarmup?.renderers ?? []),
        ...(coreMasonryInPrimary ? (masonryWarmup?.renderers ?? []) : []),
        ...(precompileCoreMasonry ? (animalWarmup?.renderers ?? []) : []),
        ...(precompileCoreMasonry ? (rockGrassWarmup?.renderers ?? []) : [])
      ];
      const primaryAdditionalInstancedRenderers = precompileCoreMasonry ? (vegetationWarmup?.renderers ?? []) : [];
      const primaryExtraMaterials = precompileCoreMasonry
        ? mergeExtraMaterials(
            coreMasonryInPrimary ? masonryWarmup?.extraMaterials : undefined,
            animalWarmup?.extraMaterials
          )
        : undefined;
      const primaryInactiveRoots = precompileCoreMasonry ? deps.getPrimaryIncludeInactiveRoots?.() : undefined;
      let primaryVariants: readonly SeedWorldShaderVariantEntry[];
      try {
        primaryVariants = ops.collectSeedWorldRendererVariants(
          deps.engine,
          deps.scene,
          deps.camera,
          deps.scene.rootEntities,
          {
            ...baseWarmupOptions,
            includeInactiveRoots: primaryInactiveRoots?.length ? primaryInactiveRoots : undefined,
            onlyEnabledRenderers: true,
            onlyFrustumVisible: true,
            ...(primaryAdditionalRenderers.length ? { additionalRenderers: primaryAdditionalRenderers } : {}),
            ...(primaryAdditionalInstancedRenderers.length
              ? { additionalInstancedRenderers: primaryAdditionalInstancedRenderers }
              : {}),
            ...(primaryExtraMaterials?.size ? { additionalRendererMaterials: primaryExtraMaterials } : {}),
            ...(primaryVegetationWarmup?.cameraOnlyRenderers.length
              ? { additionalCameraOnlyRenderers: primaryVegetationWarmup.cameraOnlyRenderers }
              : {}),
            ...(primaryVegetationWarmup?.shadowOnlyRenderers.length
              ? { additionalShadowOnlyRenderers: primaryVegetationWarmup.shadowOnlyRenderers }
              : {}),
            ...(deferSecondaryPrep ? { overlayRenderers: [] } : {}),
            includeMasonryDither: false,
            includeMasonryEntrance: parallelCompile,
            includeInstanceEntrance: false,
            includeLodDither: false,
            includeLiquidGlassMask: false,
            includePhotoCopy: false
          }
        );
      } finally {
        primaryVegetationWarmup?.dispose();
      }
      const orderedPrimary = [...primaryVariants].sort(
        (a, b) => startupShaderVariantPriority(a) - startupShaderVariantPriority(b) || a.shader.localeCompare(b.shader)
      );
      const primaryMasonryEntranceKeys = new Set<string>();
      let hasPrimaryMasonryEntrance = false;
      let hasPrimaryGlobalProxyEntrance = false;
      for (const entry of primaryVariants) {
        if (entry.shader.startsWith("Masonry/") && hasMasonryEntranceMacro(entry)) {
          hasPrimaryMasonryEntrance = true;
          if (!parallelCompile) {
            primaryMasonryEntranceKeys.add(variantKeyWithoutMasonryEntrance(entry));
          }
          if (entry.shader === "Masonry/GlobalProxy") hasPrimaryGlobalProxyEntrance = true;
        }
      }
      const secondaryPriority = (entry: SeedWorldShaderVariantEntry): number => {
        // Promote steady-state masonry variants paired with spawn-visible entrance variants on
        // !parallelCompile devices, plus Masonry/GlobalProxyShadowOnly and Masonry/GlobalProxy's
        // non-dither steady ShadowCaster pass whenever entrance mode deferred shadows until t=2.4s.
        if (
          entry.shader.startsWith("Masonry/") &&
          !hasMasonryEntranceMacro(entry) &&
          (primaryMasonryEntranceKeys.has(variantKeyWithoutMasonryEntrance(entry)) ||
            (hasPrimaryMasonryEntrance && entry.shader === "Masonry/GlobalProxyShadowOnly") ||
            (hasPrimaryGlobalProxyEntrance &&
              entry.shader === "Masonry/GlobalProxy" &&
              isShadowCasterShaderVariant(entry) &&
              !(entry.macros ?? []).some((m) => m.n === "GLOBAL_PROXY_DITHER")))
        ) {
          return -1;
        }
        return startupShaderVariantPriority(entry);
      };
      const computeSecondaryVariants = (
        fullOpts: ReturnType<typeof buildFullWarmupOptions>
      ): readonly SeedWorldShaderVariantEntry[] => {
        const allVariants = [
          ...ops.collectSeedWorldRendererVariants(
            deps.engine,
            deps.scene,
            deps.camera,
            deps.scene.rootEntities,
            fullOpts
          ),
          ...collectDeferredBackgroundVariants()
        ];
        const missing = ops.findMissingSeedWorldShaderVariants(primaryVariants, allVariants);
        // Post-ready secondary collection warms steady-state exploration variants; skip offscreen
        // masonry entrance-ON variants because startup entrance never replays on offscreen LOD views.
        const filtered = deferSecondaryPrep
          ? missing.filter((entry) => !(entry.shader.startsWith("Masonry/") && hasMasonryEntranceMacro(entry)))
          : missing;
        return [...filtered].sort(
          (a, b) => secondaryPriority(a) - secondaryPriority(b) || a.shader.localeCompare(b.shader)
        );
      };
      let secondaryVariants: readonly SeedWorldShaderVariantEntry[] = [];
      if (!deferSecondaryPrep) {
        secondaryVariants = computeSecondaryVariants(
          buildFullWarmupOptions({
            masonry: masonryWarmup,
            animal: animalWarmup,
            vegetation: vegetationWarmup,
            rockGrass: rockGrassWarmup
          })
        );
      } else {
        collectDeferredVariants = async () => {
          if (deps.isDisposed() || deps.lifetimeSignal?.aborted) return [];
          const deferredAbort = new AbortController();
          const onAbort = () => deferredAbort.abort(deps.lifetimeSignal?.reason);
          deps.lifetimeSignal?.addEventListener("abort", onAbort, { once: true });
          let deferredMasonry: SeedWorldMasonryShaderWarmupHandle | undefined;
          let deferredAnimal: SeedWorldAnimalShaderWarmupHandle | undefined;
          let deferredVegetation: SeedWorldVegetationShaderWarmupHandle | undefined;
          let deferredRockGrass: SeedWorldVegetationShaderWarmupHandle | undefined;
          let cleaned = false;
          try {
            if (!precompileCoreMasonry) {
              [deferredMasonry, deferredAnimal] = await Promise.all([
                deps.prepareMasonryShaderWarmup?.(deferredAbort.signal),
                deps.prepareAnimalShaderWarmup?.(deferredAbort.signal)
              ]);
            }
            if (cleaned || deps.isDisposed() || deps.lifetimeSignal?.aborted) return [];
            if (!precompileCoreMasonry) {
              deferredVegetation = deps.prepareVegetationShaderWarmup?.();
              deferredRockGrass = deps.prepareRockGrassShaderWarmup?.();
            }
            const deferredAssistant = deps.showAssistant ? deps.prepareAssistantPresentation() : undefined;
            return computeSecondaryVariants(
              buildFullWarmupOptions({
                masonry: deferredMasonry,
                animal: deferredAnimal,
                vegetation: deferredVegetation,
                rockGrass: deferredRockGrass,
                overlayRenderers: deferredAssistant?.root.getComponentsIncludeChildren(Renderer, []) ?? []
              })
            );
          } finally {
            cleaned = true;
            deferredAbort.abort();
            deps.lifetimeSignal?.removeEventListener("abort", onAbort);
            deferredRockGrass?.dispose();
            deferredVegetation?.dispose();
            deferredAnimal?.dispose();
            deferredMasonry?.dispose();
          }
        };
      }
      shaderWarmup = await deps.timed("warmupSeedWorldRendererVariants", () =>
        ops.warmupSeedWorldShaderVariants(deps.engine, orderedPrimary, {
          strict: true,
          signal: deps.lifetimeSignal,
          preserveOrder: true,
          frameBudgetMilliseconds: 32,
          maximumPendingPrograms: parallelCompile ? 16 : 1,
          ssrVerifyReceiverDepth
        })
      );
      deferredShaderVariants = [...(shaderWarmup.deferred ?? []), ...secondaryVariants];
    } else {
      const fullWarmupOptions = buildFullWarmupOptions({
        masonry: masonryWarmup,
        animal: animalWarmup,
        vegetation: vegetationWarmup,
        rockGrass: rockGrassWarmup
      });
      let startupVariants: readonly SeedWorldShaderVariantEntry[] = [];
      shaderWarmup = await deps.timed("warmupSeedWorldRendererVariants", () =>
        ops.warmupSeedWorldRendererVariants(deps.engine, deps.scene, deps.camera, deps.scene.rootEntities, {
          ...fullWarmupOptions,
          includeGenerationReveal: parallelCompile,
          onVariants: (variants) => {
            startupVariants = variants;
            deps.canvas.dataset.buildingShaderWarmupVariants = JSON.stringify(variants);
          }
        })
      );
      if (!parallelCompile) {
        const variantKey = (entry: SeedWorldShaderVariantEntry) =>
          `${entry.shader}/${entry.si}/${entry.pi}?${entry.macros.map((m) => `${m.n}=${m.v ?? ""}`).join(";")}`;
        const seen = new Set(startupVariants.map(variantKey));
        if (startupVariants.length > 0) {
          for (const variant of withSeedWorldGenerationRevealVariants(startupVariants)) {
            const key = variantKey(variant);
            if (!seen.has(key)) {
              seen.add(key);
              deferredShaderVariants.push(variant);
            }
          }
        }
        for (const variant of collectDeferredBackgroundVariants()) {
          const key = variantKey(variant);
          if (!seen.has(key)) {
            seen.add(key);
            deferredShaderVariants.push(variant);
          }
        }
      }
    }
  } finally {
    prepCleanedUp = true;
    prepAbort.abort();
    deps.lifetimeSignal?.removeEventListener("abort", onLifetimeAbort);
    rockGrassWarmup?.dispose();
    rockGrassWarmup = undefined;
    vegetationWarmup?.dispose();
    vegetationWarmup = undefined;
    animalWarmup?.dispose();
    animalWarmup = undefined;
    masonryWarmup?.dispose();
    masonryWarmup = undefined;
  }
  deps.onWarmupEvent?.(
    `compiled ${shaderWarmup.compiled}/${shaderWarmup.requested} variants${deferredShaderVariants.length ? ` (deferred ${deferredShaderVariants.length} to idle)` : deferSecondaryPrep ? " (secondary collection deferred to post-ready)" : ""} in ${Math.round(shaderWarmup.elapsedMilliseconds)}ms`,
    `longest=${Math.round(shaderWarmup.longestVariantMilliseconds)}ms parallelCompile=${Boolean(shaderWarmup.parallelCompileSupported)} deferred=${deferredShaderVariants.length}`
  );
  if (agentTraceEnabled) {
    deps.canvas.dataset.buildingShaderWarmup = JSON.stringify(shaderWarmup);
  }
  return { report: shaderWarmup, deferredShaderVariants, collectDeferredVariants, ssrVerifyReceiverDepth };
}
