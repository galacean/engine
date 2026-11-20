import { Camera, Engine, Entity, Material, Renderer, Scene } from "@galacean/engine";
import {
  hasParallelShaderCompile,
  warmupSeedWorldRendererVariants,
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
        includeOpaqueScreenSpaceReflection: deps.hasOpaqueScreenSpaceReflection?.() ?? false,
        includeLiquidGlassMask: deps.showAssistant,
        includePhotoCopy: deps.showAssistant,
        frameBudgetMilliseconds: 32,
        maximumPendingPrograms: parallelCompile ? 16 : 1,
        overlayRenderers: assistant?.root.getComponentsIncludeChildren(Renderer, []) ?? [],
        postProcessState: deps.getPostProcessWarmupState(),
        additionalBackgroundMaterials: deps.additionalBackgroundMaterials,
        onVariants: agentTraceEnabled
          ? (variants) => {
              deps.canvas.dataset.buildingShaderWarmupVariants = JSON.stringify(variants);
            }
          : undefined
      })
    );
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
    `longest=${Math.round(shaderWarmup.longestVariantMilliseconds)}ms parallelCompile=${Boolean(shaderWarmup.parallelCompileSupported)}`
  );
  if (agentTraceEnabled) {
    deps.canvas.dataset.buildingShaderWarmup = JSON.stringify(shaderWarmup);
  }
  return { report: shaderWarmup, deferredShaderVariants: [] };
}
