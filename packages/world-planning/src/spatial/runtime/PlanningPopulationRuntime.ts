import { TerrainPrototypeMetadata } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import { Loader, type Camera, type Engine, type Entity, type Material } from "@galacean/engine";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { detailSourceForPrototype, SeedWorldPopulationRuntime } from "../../runtime/SeedWorldPopulationRuntime.ts";
import type { SeedWorldGrassColorFieldBinding } from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";
import { SEED_WORLD_ROAD_COLOR_DEFAULT } from "../../runtime/SeedWorldTerrainRuntime.ts";
import { loadSeedWorldAssetSourceLibrary } from "@galacean/engine-vegetation/asset-assembly/SeedWorldAssetSourceLibrary";
import type { AssetAssemblySourceLibrary } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import {
  createDefaultPopulationToken,
  withTreePopulationAsset
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyPresetFactory";
import {
  createCanonicalTreePopulationToken,
  createCanonicalInstancedBirchVariationControls,
  compileProceduralTreeRuntimeAuthoringProfile,
  type ProceduralTreeRuntimeAuthoringProfile
} from "@galacean/engine-vegetation/asset-assembly/ProceduralTreeAuthoringState";
import type { TreePopulationTokenV1 } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import { SEED_WORLD_TREE_SPECIES_PROFILES } from "@galacean/engine-vegetation/world/SeedWorldTreeSpecies";
import { compilePlanningPopulation, type PlanningPopulationTerrain } from "./PlanningPopulationData";
import rules from "./population-presentation.json";
import { PlanningPopulationVisibility } from "./PlanningPopulationVisibility";
import type { SeedWorldPopulationPreview } from "../../runtime/SeedWorldPopulationPlan.ts";
import { constrainPlanningTreeProfile } from "./PlanningTreeAssets";
import { applyPlanningTreeVariations } from "./PlanningTreeVariations";

/** Existing terrain and appearance resources shared with the planner's production view. */
export interface PlanningPopulationRuntimeOptions extends PlanningPopulationTerrain {
  terrainMaterial?: Material;
  grassColorField?: SeedWorldGrassColorFieldBinding;
}
export interface PopulationResources {
  library: AssetAssemblySourceLibrary;
  profiles: readonly ProceduralTreeRuntimeAuthoringProfile[];
}
const resourcesByEngine = new WeakMap<Engine, Promise<PopulationResources>>();
export function invalidatePlanningPopulationResources(engine: Engine): void {
  resourcesByEngine.delete(engine);
}
export function preparePlanningPopulationResources(engine: Engine): Promise<PopulationResources> {
  Loader.registerClass("/Script/TerrainPrototypeMetadata.ts", TerrainPrototypeMetadata);
  const cached = resourcesByEngine.get(engine);
  if (cached) return cached;
  const loading = loadSeedWorldAssetSourceLibrary(engine, {
    treeRecipeIds: new Set(
      SEED_WORLD_TREE_SPECIES_PROFILES.filter((s) => rules.treeSpecies.includes(s.key)).map((s) => s.assetRecipeId)
    ),
    loadTreeImpostor: true,
    loadRockGeometry: false
  })
    .then((library) => {
      const fallback = createDefaultPopulationToken("tree", library) as TreePopulationTokenV1;
      const controls = createCanonicalInstancedBirchVariationControls();
      const profiles = library.treeRecipes.map((recipe) =>
        constrainPlanningTreeProfile(
          compileProceduralTreeRuntimeAuthoringProfile(
            library,
            createCanonicalTreePopulationToken(library, withTreePopulationAsset(fallback, recipe.id, library)),
            controls
          )
        )
      );
      return { library, profiles };
    })
    .catch((error) => {
      resourcesByEngine.delete(engine);
      throw error;
    });
  resourcesByEngine.set(engine, loading);
  return loading;
}

/** Owns Seed's real vegetation renderers for one immutable published planning snapshot. */
export class PlanningPopulationRuntime {
  private visible = true;
  private disposed = false;
  private projection: PlanningPopulationVisibility;
  private treeVariations: ReturnType<SeedWorldPopulationRuntime["snapshotTreeVariations"]>;
  private constructor(
    private root: Entity,
    private population: SeedWorldPopulationRuntime,
    plan: IslandPlan,
    source: SeedWorldPopulationPreview,
    private metadata: Readonly<{
      seed: number;
      plannedTrees: number;
      heightResolution: number;
      densityResolution: number;
    }>
  ) {
    this.projection = new PlanningPopulationVisibility(plan, source);
    this.treeVariations = population.snapshotTreeVariations();
  }

  /** Start the cached resource request while the caller prepares the published terrain rasters. */
  static async prepareResources(engine: Engine): Promise<void> {
    await preparePlanningPopulationResources(engine);
  }

  /** Adapt the provided layout and rasters; registered project resources are shared with Terrain.
   * @returns Renderer owner using the caller's camera and world coordinates.
   */
  static async create(
    engine: Engine,
    parent: Entity,
    camera: Camera,
    plan: IslandPlan,
    options: PlanningPopulationRuntimeOptions
  ): Promise<PlanningPopulationRuntime> {
    const data = compilePlanningPopulation(plan, options);
    const { library, profiles } = await preparePlanningPopulationResources(engine);
    // Fail before publishing the view, rather than repeatedly losing whole streamed cells.
    for (const field of data.population.detailDensityFields) {
      detailSourceForPrototype(
        field.category === "grass" ? library.grassFamily : library.flowerFamily,
        field.assetProfileKey
      );
    }
    const root = parent.createChild("Planned vegetation");
    let population: SeedWorldPopulationRuntime | undefined;
    try {
      population = new SeedWorldPopulationRuntime(
        engine,
        root,
        camera,
        library,
        profiles,
        data.world,
        data.fields,
        data.population,
        undefined,
        options.grassColorField,
        SEED_WORLD_ROAD_COLOR_DEFAULT
      );
      applyPlanningTreeVariations(population, plan.authoredResources ?? []);
      if (options.terrainMaterial) population.setGrassTerrainSurface(options.terrainMaterial);
      const size = data.fields.sizeMetres,
        resolution = data.fields.surfaceResolution;
      population.setGrassWaterCoverage((x, z) => {
        if (x < 0 || z < 0 || x > size || z > size) return true;
        const col = Math.min(resolution - 1, Math.round((x / size) * (resolution - 1)));
        const row = Math.min(resolution - 1, Math.round((z / size) * (resolution - 1)));
        return data.fields.waterMask[row * resolution + col] !== 0;
      });
      return new PlanningPopulationRuntime(root, population, plan, data.population, {
        seed: data.world.rootSeed,
        plannedTrees: data.population.treeInstances.length,
        heightResolution: data.fields.heightResolution,
        densityResolution: data.fields.surfaceResolution
      });
    } catch (error) {
      population?.destroy();
      root.destroy();
      throw error;
    }
  }
  /** Advance Seed's bounded cell streaming and LOD transitions. */
  update(deltaSeconds: number): void {
    if (!this.disposed && this.visible) this.population.update(deltaSeconds);
  }
  /** Presentation visibility does not change authoring or density data. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!this.disposed) this.root.isActive = visible;
  }
  /** Apply the hierarchy's resolved object masks without regenerating a planning snapshot. */
  setLayers(layers: Readonly<Record<string, boolean>>, active: boolean): void {
    this.setVisible(active && layers.landscape !== false);
    if (this.disposed || !this.visible) return;
    this.population.trees.isActive = layers.tree !== false;
    this.population.setDetailCategoryVisible("grass", layers.grass !== false);
    this.population.setDetailCategoryVisible("flower", layers.flowers !== false);
    const next = this.projection.resolve(layers);
    if (next) {
      void this.population.applyAuthoringPopulationLayout(next.layout, next.bounds);
      if (next.treeChanged) {
        const ids = new Set(next.layout.treeInstances.map((p) => p.id));
        this.population.restoreTreeVariations(this.treeVariations.filter((p) => ids.has(p.instanceId)));
      }
    }
  }
  /** Prepare one nearby Detail cell only when production shader precompilation is explicitly requested. */
  warmup(): void {
    if (!this.disposed) this.population.warmupDetails();
  }
  /** Lightweight recorded counters, without sampling, image readback or new geometry work.
   * Submitted tree LOD counts include both draws during an authored LOD cross-fade.
   */
  getDiagnostics() {
    return {
      ...this.metadata,
      visible: this.visible && !this.disposed,
      residentCells: this.population.residentCellCount,
      resident: this.population.residentAcceptedCounts,
      submitted: this.population.submittedCounts,
      treeLods: [...this.population.treeSubmittedLodCounts],
      detailCompacted: this.population.detailCompactedCounts,
      detailBatches: this.population.detailBatchCount,
      submittedDetailBatches: this.population.detailSubmittedBatchCount
    };
  }
  /** Release per-snapshot GPU resources; keep engine-owned source assets reusable. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.population.destroy();
    this.root.destroy();
  }
}
