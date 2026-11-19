import { Camera, Engine, Entity, Material, Renderer, Scene } from "@galacean/engine";
import {
  collectSeedWorldRendererVariants,
  findMissingSeedWorldShaderVariants,
  hasParallelShaderCompile,
  warmupSeedWorldRendererVariants,
  warmupSeedWorldShaderVariants,
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
  readonly prepareMasonryShaderWarmup?: (
    signal: AbortSignal
  ) => Promise<SeedWorldMasonryShaderWarmupHandle | undefined> | undefined;
  readonly prepareAssistantPresentation: () => { readonly root: Entity } | undefined;
  readonly getIncludeInactiveRoots?: () => readonly Entity[];
  readonly getPostProcessWarmupState: () => SeedWorldRendererWarmupOptions["postProcessState"];
  readonly additionalBackgroundMaterials: SeedWorldRendererWarmupOptions["additionalBackgroundMaterials"];
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
  if (s === "Terrain/Terrain" || s === "Terrain/Grass" || s.startsWith("Water/")) return entry.pi === 0 ? 1 : 3;
  if (s === "Terrain/Vegetation" || s === "Terrain/Surface") return entry.pi === 0 ? 2 : 4;
  if (s.startsWith("Masonry/")) return entry.pi === 0 ? 3 : 5;
  return entry.pi === 0 ? 4 : 6;
}

export async function runSeedWorldStartupShaderWarmup(
  deps: SeedWorldStartupShaderWarmupDeps
): Promise<SeedWorldStartupShaderWarmupResult> {
  if (!deps.precompileShaders) {
    return { deferredShaderVariants: [] };
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
  const prepAbort = new AbortController();
  const onLifetimeAbort = () => prepAbort.abort(deps.lifetimeSignal?.reason);
  if (deps.lifetimeSignal?.aborted) prepAbort.abort(deps.lifetimeSignal.reason);
  else deps.lifetimeSignal?.addEventListener("abort", onLifetimeAbort, { once: true });
  let prepCleanedUp = false;
  let deferredShaderVariants: readonly SeedWorldShaderVariantEntry[] = [];
  let shaderWarmup: SeedWorldShaderWarmupReport;
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
    deps.progress(0.98, "预编译场景渲染变体");
    const assistant = deps.showAssistant ? deps.prepareAssistantPresentation() : undefined;
    const parallelCompile = ops.hasParallelShaderCompile(deps.engine);
    const includeInactiveRoots = deps.getIncludeInactiveRoots?.();
    const baseWarmupOptions = {
      strict: true,
      includeInactiveEntities: false,
      includeGpuInstancing: true,
      onlySharedMeshGpuInstancing: true,
      frameBudgetMilliseconds: 32,
      maximumPendingPrograms: 16,
      overlayRenderers: assistant?.root.getComponentsIncludeChildren(Renderer, []) ?? [],
      postProcessState: deps.getPostProcessWarmupState(),
      additionalBackgroundMaterials: deps.additionalBackgroundMaterials
    } as const;
    const fullWarmupOptions = {
      ...baseWarmupOptions,
      includeInactiveRoots,
      additionalRenderers: masonryWarmup?.renderers,
      additionalRendererMaterials: masonryWarmup?.extraMaterials,
      additionalPointLightCounts: masonryWarmup?.decorationPointLightBudget
        ? [masonryWarmup.decorationPointLightBudget]
        : undefined
    } as const;
    const deferSecondary = !parallelCompile && !agentTraceEnabled;
    if (deferSecondary) {
      const primaryVariants = ops.collectSeedWorldRendererVariants(
        deps.engine,
        deps.scene,
        deps.camera,
        deps.scene.rootEntities,
        {
          ...baseWarmupOptions,
          onlyEnabledRenderers: true,
          includeMasonryDither: false,
          includeMasonryEntrance: false,
          includeInstanceEntrance: false,
          includeLodDither: false
        }
      );
      const orderedPrimary = [...primaryVariants].sort(
        (a, b) => startupShaderVariantPriority(a) - startupShaderVariantPriority(b) || a.shader.localeCompare(b.shader)
      );
      const allVariants = ops.collectSeedWorldRendererVariants(
        deps.engine,
        deps.scene,
        deps.camera,
        deps.scene.rootEntities,
        fullWarmupOptions
      );
      const secondaryVariants = ops.findMissingSeedWorldShaderVariants(primaryVariants, allVariants);
      shaderWarmup = await deps.timed("warmupSeedWorldRendererVariants", () =>
        ops.warmupSeedWorldShaderVariants(deps.engine, orderedPrimary, {
          strict: true,
          preserveOrder: true,
          frameBudgetMilliseconds: 32,
          maximumPendingPrograms: 1,
          maxElapsedMilliseconds: 6500
        })
      );
      deferredShaderVariants = [...(shaderWarmup.deferred ?? []), ...secondaryVariants];
    } else {
      shaderWarmup = await deps.timed("warmupSeedWorldRendererVariants", () =>
        ops.warmupSeedWorldRendererVariants(deps.engine, deps.scene, deps.camera, deps.scene.rootEntities, {
          ...fullWarmupOptions,
          onVariants: agentTraceEnabled
            ? (variants) => {
                deps.canvas.dataset.buildingShaderWarmupVariants = JSON.stringify(variants);
              }
            : undefined
        })
      );
    }
  } finally {
    prepCleanedUp = true;
    prepAbort.abort();
    deps.lifetimeSignal?.removeEventListener("abort", onLifetimeAbort);
    masonryWarmup?.dispose();
    masonryWarmup = undefined;
  }
  deps.onWarmupEvent?.(
    `compiled ${shaderWarmup.compiled}/${shaderWarmup.requested} variants${deferredShaderVariants.length ? ` (deferred ${deferredShaderVariants.length} to idle)` : ""} in ${Math.round(shaderWarmup.elapsedMilliseconds)}ms`,
    `longest=${Math.round(shaderWarmup.longestVariantMilliseconds)}ms parallelCompile=${Boolean(shaderWarmup.parallelCompileSupported)}`
  );
  if (agentTraceEnabled) {
    deps.canvas.dataset.buildingShaderWarmup = JSON.stringify(shaderWarmup);
  }
  return { report: shaderWarmup, deferredShaderVariants };
}
