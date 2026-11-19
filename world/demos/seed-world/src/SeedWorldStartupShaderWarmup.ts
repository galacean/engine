import { Camera, Engine, Entity, Renderer, Scene } from "@galacean/engine";
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

export interface SeedWorldStartupShaderWarmupDeps {
  readonly precompileShaders: boolean;
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly pageUrl: URL;
  readonly canvas: HTMLCanvasElement;
  readonly showAssistant: boolean;
  readonly isDisposed: () => boolean;
  readonly progress: (value: number, stage: string) => void;
  readonly timed: <T>(name: string, work: () => T) => T;
  readonly prepareFarmingPresentation?: () => Promise<unknown> | unknown;
  readonly prepareAnimalPresentation?: () => Promise<unknown> | unknown;
  readonly prepareVegetationPresentation?: () => Promise<unknown> | unknown;
  readonly prepareAssistantPresentation: () => { readonly root: Entity } | undefined;
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
  await deps.timed("preparePresentation (farming + animals + vegetation)", () =>
    Promise.all([
      deps.prepareFarmingPresentation?.(),
      deps.prepareAnimalPresentation?.(),
      deps.prepareVegetationPresentation?.()
    ])
  );
  if (deps.isDisposed()) {
    throw new DOMException("Seed page disposed during shader preparation", "AbortError");
  }
  deps.progress(0.98, "预编译场景渲染变体");
  const assistant = deps.showAssistant ? deps.prepareAssistantPresentation() : undefined;
  const agentTraceEnabled = deps.pageUrl.searchParams.get("agentTrace") === "1";
  const parallelCompile = ops.hasParallelShaderCompile(deps.engine);
  const sharedWarmupOptions = {
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
  const deferSecondary = !parallelCompile && !agentTraceEnabled;
  let deferredShaderVariants: readonly SeedWorldShaderVariantEntry[] = [];
  let shaderWarmup: SeedWorldShaderWarmupReport;
  if (deferSecondary) {
    const primaryVariants = ops.collectSeedWorldRendererVariants(
      deps.engine,
      deps.scene,
      deps.camera,
      deps.scene.rootEntities,
      {
        ...sharedWarmupOptions,
        onlyEnabledRenderers: true,
        includeMasonryDither: false,
        includeInstanceEntrance: false
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
      sharedWarmupOptions
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
        ...sharedWarmupOptions,
        onVariants: agentTraceEnabled
          ? (variants) => {
              deps.canvas.dataset.buildingShaderWarmupVariants = JSON.stringify(variants);
            }
          : undefined
      })
    );
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
