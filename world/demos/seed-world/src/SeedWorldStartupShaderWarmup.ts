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
  readonly prepareVegetationPresentation?: () => Promise<unknown> | unknown;
  readonly preparePrimaryVegetationShaderWarmup?: () => SeedWorldPrimaryVegetationShaderWarmupHandle | undefined;
  readonly prepareVegetationShaderWarmup?: () => SeedWorldVegetationShaderWarmupHandle | undefined;
  readonly prepareRockGrassShaderWarmup?: () => SeedWorldVegetationShaderWarmupHandle | undefined;
  readonly prepareMasonryShaderWarmup?: (
    signal: AbortSignal
  ) => Promise<SeedWorldMasonryShaderWarmupHandle | undefined> | undefined;
  readonly prepareAssistantPresentation: () => { readonly root: Entity } | undefined;
  readonly getIncludeInactiveRoots?: () => readonly Entity[];
  readonly hasOpaqueScreenSpaceReflection?: () => boolean;
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
  /** Optional hook invoked after presentation prep finishes and right before collecting spawn-frame primary variants. */
  readonly beforePrimaryCollect?: () => void;
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
    warmupSeedWorldShaderVariants:
      deps.warmupOperations?.warmupSeedWorldShaderVariants ?? warmupSeedWorldShaderVariants
  };

  // Keep world draws disabled until reveal.
  deps.camera.enabled = false;
  deps.progress(0.96, "准备世界渲染资源");
  let masonryWarmup: SeedWorldMasonryShaderWarmupHandle | undefined;
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
  try {
    await deps.timed(
      deferSecondaryPrep
        ? "preparePresentation (farming + animals + vegetation)"
        : "preparePresentation (farming + animals + vegetation + masonry)",
      () =>
        Promise.all([
          deps.prepareFarmingPresentation?.(),
          deps.prepareAnimalPresentation?.(),
          deps.prepareVegetationPresentation?.(),
          ...(!deferSecondaryPrep
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
    deps.beforePrimaryCollect?.();
    if (!deferSecondaryPrep) {
      vegetationWarmup = deps.prepareVegetationShaderWarmup?.();
      rockGrassWarmup = deps.prepareRockGrassShaderWarmup?.();
    }
    deps.progress(0.98, "预编译场景渲染变体");
    const assistant = !deferSecondaryPrep && deps.showAssistant ? deps.prepareAssistantPresentation() : undefined;
    const parallelCompile = ops.hasParallelShaderCompile(deps.engine);
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
      // On synchronous mobile GPUs (parallel=false), defer CRUD-only reveal/wave variants to
      // post-ready idle frames so startup load time stays at baseline parity.
      includeGenerationReveal: parallelCompile,
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
      vegetation?: SeedWorldVegetationShaderWarmupHandle;
      rockGrass?: SeedWorldVegetationShaderWarmupHandle;
      overlayRenderers?: readonly Renderer[];
    }) => {
      const additionalRenderers = [
        ...(handles.masonry?.renderers ?? []),
        ...(handles.rockGrass?.renderers ?? [])
      ];
      return {
        ...baseWarmupOptions,
        ...(handles.overlayRenderers !== undefined ? { overlayRenderers: handles.overlayRenderers } : {}),
        includeGenerationReveal: true,
        additionalRenderers: additionalRenderers.length ? additionalRenderers : undefined,
        additionalInstancedRenderers: handles.vegetation?.renderers,
        additionalRendererMaterials: handles.masonry?.extraMaterials,
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
      let primaryVariants: readonly SeedWorldShaderVariantEntry[];
      try {
        primaryVariants = ops.collectSeedWorldRendererVariants(
          deps.engine,
          deps.scene,
          deps.camera,
          deps.scene.rootEntities,
          {
            ...baseWarmupOptions,
            includeInactiveRoots: undefined,
            onlyEnabledRenderers: true,
            onlyFrustumVisible: true,
            ...(primaryVegetationWarmup?.renderers.length
              ? { additionalRenderers: primaryVegetationWarmup.renderers }
              : {}),
            ...(primaryVegetationWarmup?.cameraOnlyRenderers.length
              ? { additionalCameraOnlyRenderers: primaryVegetationWarmup.cameraOnlyRenderers }
              : {}),
            ...(primaryVegetationWarmup?.shadowOnlyRenderers.length
              ? { additionalShadowOnlyRenderers: primaryVegetationWarmup.shadowOnlyRenderers }
              : {}),
            ...(deferSecondaryPrep ? { overlayRenderers: [] } : {}),
            includeMasonryDither: parallelCompile,
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
        return [...ops.findMissingSeedWorldShaderVariants(primaryVariants, allVariants)].sort(
          (a, b) => secondaryPriority(a) - secondaryPriority(b) || a.shader.localeCompare(b.shader)
        );
      };
      let secondaryVariants: readonly SeedWorldShaderVariantEntry[] = [];
      if (!deferSecondaryPrep) {
        secondaryVariants = computeSecondaryVariants(
          buildFullWarmupOptions({
            masonry: masonryWarmup,
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
          let deferredVegetation: SeedWorldVegetationShaderWarmupHandle | undefined;
          let deferredRockGrass: SeedWorldVegetationShaderWarmupHandle | undefined;
          let cleaned = false;
          try {
            deferredMasonry = await deps.prepareMasonryShaderWarmup?.(deferredAbort.signal);
            if (cleaned || deps.isDisposed() || deps.lifetimeSignal?.aborted) return [];
            deferredVegetation = deps.prepareVegetationShaderWarmup?.();
            deferredRockGrass = deps.prepareRockGrassShaderWarmup?.();
            const deferredAssistant = deps.showAssistant ? deps.prepareAssistantPresentation() : undefined;
            return computeSecondaryVariants(
              buildFullWarmupOptions({
                masonry: deferredMasonry,
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
