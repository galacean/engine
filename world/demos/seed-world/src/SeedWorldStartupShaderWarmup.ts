import { Camera, Engine, Entity, Material, Renderer, Scene } from "@galacean/engine";
import {
  collectSeedWorldRendererVariants,
  hasParallelShaderCompile,
  warmupSeedWorldRendererVariants,
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
  readonly onWarmupEvent?: (message: string, detail: string) => void;
  readonly warmupOperations?: {
    readonly hasParallelShaderCompile?: typeof hasParallelShaderCompile;
    readonly warmupSeedWorldRendererVariants?: typeof warmupSeedWorldRendererVariants;
  };
}

export interface SeedWorldStartupShaderWarmupResult {
  readonly report?: SeedWorldShaderWarmupReport;
  readonly deferredShaderVariants: readonly SeedWorldShaderVariantEntry[];
}

export async function runSeedWorldStartupShaderWarmup(
  deps: SeedWorldStartupShaderWarmupDeps
): Promise<SeedWorldStartupShaderWarmupResult> {
  if (!deps.precompileShaders) {
    return { deferredShaderVariants: [] };
  }
  const ops = {
    hasParallelShaderCompile: deps.warmupOperations?.hasParallelShaderCompile ?? hasParallelShaderCompile,
    warmupSeedWorldRendererVariants:
      deps.warmupOperations?.warmupSeedWorldRendererVariants ?? warmupSeedWorldRendererVariants
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
  let shaderWarmup: SeedWorldShaderWarmupReport;
  const deferredShaderVariants: SeedWorldShaderVariantEntry[] = [];
  const agentTraceEnabled = deps.pageUrl.searchParams.get("agentTrace") === "1";
  try {
    await deps.timed("preparePresentation (farming + animals + vegetation + masonry)", () =>
      Promise.all([
        deps.prepareFarmingPresentation?.(),
        deps.prepareAnimalPresentation?.(),
        deps.prepareVegetationPresentation?.(),
        deps.prepareMasonryShaderWarmup?.(prepAbort.signal)?.then((prepared) => {
          if (!prepared) return;
          if (prepCleanedUp) prepared.dispose();
          else masonryWarmup = prepared;
        })
      ])
    );
    if (deps.isDisposed()) {
      throw new DOMException("Seed page disposed during shader preparation", "AbortError");
    }
    vegetationWarmup = deps.prepareVegetationShaderWarmup?.();
    rockGrassWarmup = deps.prepareRockGrassShaderWarmup?.();
    deps.progress(0.98, "预编译场景渲染变体");
    const assistant = deps.showAssistant ? deps.prepareAssistantPresentation() : undefined;
    const parallelCompile = ops.hasParallelShaderCompile(deps.engine);
    const includeInactiveRoots = deps.getIncludeInactiveRoots?.();
    const additionalRenderers = [
      ...(masonryWarmup?.renderers ?? []),
      ...(rockGrassWarmup?.renderers ?? [])
    ];
    let startupVariants: readonly SeedWorldShaderVariantEntry[] = [];
    const startupBackgroundMaterials =
      parallelCompile && deps.deferredBackgroundMaterials?.length
        ? [...(deps.additionalBackgroundMaterials ?? []), ...deps.deferredBackgroundMaterials]
        : deps.additionalBackgroundMaterials;
    shaderWarmup = await deps.timed("warmupSeedWorldRendererVariants", () =>
      ops.warmupSeedWorldRendererVariants(deps.engine, deps.scene, deps.camera, deps.scene.rootEntities, {
        strict: true,
        includeInactiveEntities: false,
        includeInactiveRoots,
        additionalRenderers: additionalRenderers.length ? additionalRenderers : undefined,
        additionalInstancedRenderers: vegetationWarmup?.renderers,
        additionalRendererMaterials: masonryWarmup?.extraMaterials,
        additionalPointLightCounts: masonryWarmup?.decorationPointLightBudget
          ? [masonryWarmup.decorationPointLightBudget]
          : undefined,
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
        onVariants:
          agentTraceEnabled || !parallelCompile
            ? (variants) => {
                startupVariants = variants;
                if (agentTraceEnabled) {
                  deps.canvas.dataset.buildingShaderWarmupVariants = JSON.stringify(variants);
                }
              }
            : undefined
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
      if (deps.deferredBackgroundMaterials?.length) {
        const bgVariants = collectSeedWorldRendererVariants(deps.engine, deps.scene, deps.camera, [], {
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
        for (const variant of bgVariants) {
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
    `compiled ${shaderWarmup.compiled}/${shaderWarmup.requested} variants in ${Math.round(shaderWarmup.elapsedMilliseconds)}ms`,
    `longest=${Math.round(shaderWarmup.longestVariantMilliseconds)}ms parallelCompile=${Boolean(shaderWarmup.parallelCompileSupported)} deferred=${deferredShaderVariants.length}`
  );
  if (agentTraceEnabled) {
    deps.canvas.dataset.buildingShaderWarmup = JSON.stringify(shaderWarmup);
  }
  return { report: shaderWarmup, deferredShaderVariants };
}
