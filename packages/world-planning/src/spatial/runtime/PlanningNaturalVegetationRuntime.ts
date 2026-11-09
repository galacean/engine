import type { PreparedTerrainUpdate } from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import type { SeedWorldAuthoringRuntimeBoundsV1 } from "../../world/SeedWorldAuthoringRuntimeDelta";
import { createNaturalTreeSpeciesRegions } from "../../planning-data/NaturalVegetationProfile";
import { vegetationRank } from "@galacean/engine-vegetation/world/VegetationRandom";
import { sampleSeedWorldHeight } from "../../runtime/SeedWorldFields.ts";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { resolvePlanningNaturalPlantPick } from "./PlanningWorldPicking";
import {
  landscapeGrassPaletteArea,
  LANDSCAPE_GRASS_COVERAGE
} from "../../integrations/vegetation/VegetationLandscapeGrass.ts";
import {
  getSeedWorldAssetPlacementProfile,
  DETAIL_HORIZONTAL_SCALE_VARIATION_MINIMUM,
  DETAIL_HORIZONTAL_SCALE_VARIATION_MAXIMUM,
  SEED_WORLD_SURFACE_DETAIL_TERMINAL_DISTANCE_MULTIPLIER
} from "../../world/SeedWorldAssetPlacementProfile";
import {
  BoundingBox,
  Matrix,
  MeshRenderer,
  Vector3,
  Vector4,
  type Material,
  type ModelMesh,
  type Camera,
  type Entity
} from "@galacean/engine";
import type {
  AssetAssemblySourceLibrary,
  AtomicAssemblyPlacement
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import { PlantSpeciesSources } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesSources";
import {
  PLANT_SPECIES,
  PLANT_SPECIES_CATALOG,
  PLANT_SPECIES_MATERIALS,
  PLANT_GROUND_COVER_VARIATIONS,
  PLANT_TREE_SPECIES
} from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import { VEGETATION_AUTHORING_REFERENCE_SCALE } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyRenderProfile";
import { plantSpeciesResourceUrl } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import { ProceduralPlantLibraryRuntime } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantLibraryRuntime";
import {
  loadProceduralPlantMaterialBindings,
  plantMaterialRole
} from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantMaterialBindings";
import type { SeedWorldTerrainRuntime } from "../../runtime/SeedWorldTerrainRuntime.ts";
import { TerrainLodGroupRendererRuntime } from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import { SEED_WORLD_POPULATION_RUNTIME_PROFILE } from "../../runtime/SeedWorldPopulationRuntimeCell.ts";
import { resolveSeedWorldTreeTransitionHeights } from "../../world/SeedWorldRuntimeLodProfile";
import {
  SEED_WORLD_NATURAL_VEGETATION_ASSET_IDS,
  NATURAL_VEGETATION_COMPANION_PATCHES
} from "../../runtime/NaturalVegetationLayers.ts";
import { companionAnchorReach } from "@galacean/engine-vegetation/world/VegetationCompanionPatches";
import type {
  LandscapePlantInstance,
  VegetationLandscapePlan
} from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { envelope } from "../../semantic-study/IslandPlanAtoms";
import { overlap } from "../../semantic-study/WorldPlanningGeometry";
import type { PlanningHeightmap } from "../../semantic-study/PlanningHeightmap";
import type { SeedWorldFields } from "../../runtime/SeedWorldFields.ts";
import type { SeedWorldPopulationPreview } from "../../runtime/SeedWorldPopulationPlan.ts";
import {
  PlanningNaturalVegetation,
  planningEditablePlants,
  type PlanningPlantAsset
} from "./PlanningNaturalVegetation";
import {
  plantMaterialColorOverrideMask,
  resolvePlantMaterialColor,
  validatePlantMaterialParameters,
  type PlantMaterialParameters
} from "../PlantMaterialParameters";
import { flowerAssetResourceIds } from "../../planning-data/FlowerAssetWeights";
import type { LandscapeView, LandscapeFocus } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import { RockFormationClient } from "../../integrations/terrain/rock-formation/Client.ts";
import type { RockFormationSettings } from "../../integrations/terrain/rock-formation/Settings.ts";
import {
  COMPANION_ROCK_KINDS,
  companionRockGeometryKey,
  companionRockJob
} from "../../integrations/terrain/rock-formation/CompanionRocks.ts";
import {
  ROCK_GENERATION_DEFAULTS,
  rockGenerationKind,
  type RockGenerationKind,
  type RockGenerationProfile
} from "../../integrations/terrain/rock-formation/GenerationProfile.ts";
import {
  createRockFormationMaterial,
  uploadRockFormationSurface,
  type RockFormationSurface
} from "../../integrations/terrain/rock-formation/View.ts";
import { prepareRockTextures, setRockTextureScale } from "../../integrations/terrain/rock-formation/RockMaterial";
import type { RockColorBlend } from "../../integrations/terrain/rock-formation/ColorPalette.ts";
import { setRockColorBlend } from "../../integrations/terrain/rock-formation/ColorMaterial";

type PlantSource = ReturnType<ProceduralPlantLibraryRuntime["getPlacementSources"]>[number];
type Source = Pick<PlantSource, "bounds" | "rendererBindings"> & {
  entry: Pick<PlantSource["entry"], "id" | "category" | "instanceScale">;
  kind?: "stone";
  transitionHeights?: readonly number[];
  geometrySize?: readonly number[];
};
type Plant = {
  root: Entity;
  lod: TerrainLodGroupRendererRuntime;
  instance: LandscapePlantInstance;
  pickBatches: readonly SeedWorldArrayPickBatch[];
  groundHeight: number;
  grassRootPositions: readonly Vector4[];
  foliageRenderers: readonly MeshRenderer[];
  barkRenderers: readonly MeshRenderer[];
};
type Cell = {
  root: Entity;
  plants: Plant[];
  counts: Readonly<Record<string, number>>;
  populations: VegetationLandscapePlan["diagnostics"]["populations"];
  decorations?: VegetationLandscapePlan["diagnostics"]["decorations"];
  visibilityRejected: number;
};
type FoliageColors = Record<
  string,
  {
    plants: number;
    brightness: [number, number];
    rendererLuminance: [number, number];
    chromaticity: [[number, number], [number, number], [number, number]];
  }
>;
const plantingHeights = new Map(PLANT_SPECIES.map((entry) => [entry.id, entry.vegetation.plantingHeightM]));
/** Shared procedural resources plus ordinary MeshRenderers: Engine native instancing remains authoritative. */
export class PlanningNaturalVegetationRuntime {
  private readonly libraries: ProceduralPlantLibraryRuntime[] = [];
  private catalogSources?: PlantSpeciesSources;
  private materials?: Awaited<ReturnType<typeof loadProceduralPlantMaterialBindings>>;
  private sources: ReadonlyMap<string, Source>[] = [];
  private planner!: PlanningNaturalVegetation;
  private population!: SeedWorldPopulationPreview;
  plantAssets: readonly PlanningPlantAsset[] = [];
  private readonly trees: Plant[] = [];
  private readonly treePool = new Map<string, Plant>();
  private height!: PlanningHeightmap;
  private readonly cells = new Map<string, Cell>();
  private detailTask?: Promise<void>;
  private readonly groundExclusions = new Map<string, readonly PlanPoint[][]>();
  private foliageColors?: FoliageColors;
  private barkColors?: FoliageColors;
  private readonly treeRoot: Entity;
  private readonly detailRoot: Entity;
  private readonly resourceRoot: Entity;
  private rockSources?: Awaited<ReturnType<typeof createCompanionRockSources>>;
  private rockGenerationProfile: RockGenerationProfile = ROCK_GENERATION_DEFAULTS;
  private treeRegions?: Record<
    string,
    {
      dominantGroup: string;
      species: Record<string, number>;
      interior: number;
      interiorOtherSpecies: number;
      boundary: number;
    }
  >;
  private time = 0;
  private disposed = false;
  private error?: string;
  private preparedGroundingFields?: SeedWorldFields;
  private readonly grassMaterials = new Set<Material>();
  private readonly groundCoverMaterials = new Map<Material, Map<string, Material>>();
  private readonly groundCoverBrightness: Record<string, number> = {};
  private readonly releaseGrassAppearance: Array<() => void> = [];
  private rockGrassAppearance?: (material: Material) => () => void;
  private constructor(
    private readonly owner: Entity,
    treeParent: Entity,
    detailParent: Entity,
    private readonly camera: Camera,
    private readonly library: AssetAssemblySourceLibrary,
    private plan: IslandPlan,
    private groundingFields: SeedWorldFields,
    private readonly materialParameters: PlantMaterialParameters,
    private readonly presentation?: { view: LandscapeView; focus: LandscapeFocus }
  ) {
    this.treeRoot = treeParent.createChild("Natural meadow trees");
    this.detailRoot = detailParent.createChild("Natural meadow understory");
    this.resourceRoot = owner.createChild("Natural meadow sources");
    this.resourceRoot.isActive = false;
  }
  /** Presentation-only understory visibility; trees and generated placement data stay intact. */
  get understoryVisible(): boolean {
    return this.detailRoot.isActive;
  }

  setUnderstoryVisible(visible: boolean): void {
    this.detailRoot.isActive = visible;
  }

  static async create(
    owner: Entity,
    treeParent: Entity,
    detailParent: Entity,
    camera: Camera,
    library: AssetAssemblySourceLibrary,
    plan: IslandPlan,
    height: PlanningHeightmap,
    fields: SeedWorldFields,
    population: SeedWorldPopulationPreview,
    rocks: {
      client: RockFormationClient;
      settings: RockFormationSettings;
      signal: AbortSignal;
      generationProfile?: RockGenerationProfile;
    },
    materialParameters: PlantMaterialParameters = {},
    terrain?: Pick<SeedWorldTerrainRuntime, "registerGrassAppearanceMaterial">,
    presentation?: { view: LandscapeView; focus: LandscapeFocus },
    groundingFields: SeedWorldFields = fields
  ) {
    const runtime = new PlanningNaturalVegetationRuntime(
      owner,
      treeParent,
      detailParent,
      camera,
      library,
      plan,
      groundingFields,
      validatePlantMaterialParameters(materialParameters),
      presentation
    );
    if (terrain) runtime.rockGrassAppearance = (material) => terrain.registerGrassAppearanceMaterial(material);
    try {
      runtime.materials = await loadProceduralPlantMaterialBindings(
        owner.engine,
        library,
        plantSpeciesResourceUrl(PLANT_SPECIES_CATALOG.materialFile, owner.engine)
      );
      const assetIds = new Set([
        ...SEED_WORLD_NATURAL_VEGETATION_ASSET_IDS,
        ...flowerAssetResourceIds((plan.flowerRegions ?? []).map((region) => region.config))
      ]);
      for (const lod of [0, 2, 3]) {
        const plants = await ProceduralPlantLibraryRuntime.load({
          owner: runtime.resourceRoot,
          camera,
          indexUrl: plantSpeciesResourceUrl("plant-species.json", owner.engine),
          materialForSlot: (slot, asset, id) => {
            let material = runtime.materials!.materialForSlot(slot, asset, id);
            const role = plantMaterialRole(slot),
              range = PLANT_GROUND_COVER_VARIATIONS.get(asset.id);
            const groundCover = !!range && (role === "leaf" || role === "shrub");
            let brightness = 1;
            if (terrain && groundCover) {
              let variants = runtime.groundCoverMaterials.get(material);
              if (!variants) runtime.groundCoverMaterials.set(material, (variants = new Map()));
              let variant = variants.get(asset.id);
              if (!variant) {
                variant = material.clone();
                variants.set(asset.id, variant);
              }
              material = variant;
              brightness =
                range[0] +
                (range[1] - range[0]) * vegetationRank(plan.parameters.seed, `ground-cover-color:${asset.id}`);
              runtime.groundCoverBrightness[asset.id] = brightness;
            }
            if (terrain && (role === "grass" || groundCover) && !runtime.grassMaterials.has(material)) {
              runtime.grassMaterials.add(material);
              material.shaderData.enableMacro(
                groundCover ? "MATERIAL_VEGETATION_SHARED_GRASS_COLOR" : "MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE"
              );
              material.shaderData.enableMacro("MATERIAL_GRASS_SHARED_COLOR_FIELD");
              // Cover inherits only colour. Full grass appearance also owns root fusion and blade lighting.
              if (!groundCover)
                for (const macro of [
                  "MATERIAL_ENABLE_SECOND_COLOR",
                  "MATERIAL_HAS_NORMALTEXTURE",
                  "MATERIAL_HAS_SMOOTHNESS_TEXTURE",
                  "MATERIAL_ENABLE_TRANSLUCENCY"
                ])
                  material.shaderData.disableMacro(macro);
              runtime.releaseGrassAppearance.push(terrain.registerGrassAppearanceMaterial(material, brightness));
            }
            return material;
          },
          colorForSlot: runtime.materials.colorForSlot,
          normalMapped: true,
          populationOnly: true,
          assetIds,
          lod
        });
        plants.setShadows(SEED_WORLD_POPULATION_RUNTIME_PROFILE.shadows.castShadows);
        runtime.libraries.push(plants);
        runtime.sources.push(new Map(plants.getPlacementSources(true).map((source) => [source.entry.id, source])));
      }
      runtime.catalogSources = await PlantSpeciesSources.load(runtime.resourceRoot, [0, 2, 3], assetIds);
      runtime.sources = runtime.sources.map(
        (sources, level) => new Map([...sources, ...runtime.catalogSources!.levels[level]])
      );
      (await runtime.prepareRocks(rocks.client, rocks.settings, rocks.signal, rocks.generationProfile)).commit();
      const assets: PlanningPlantAsset[] = [...runtime.sources[0].values()].map((source) => {
        const { entry, bounds, kind } = source;
        const plantingHeightM = plantingHeights.get(entry.id);
        return {
          id: entry.id,
          bounds,
          ...(kind ? { kind } : {}),
          height: bounds.max[1] - bounds.min[1],
          ...(kind !== "stone" && plantingHeightM !== undefined
            ? { groundingOffset: planningNaturalPlantGroundingOffset(source, plantingHeightM) }
            : {}),
          radius: Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) / 2,
          footprintArea: (bounds.max[0] - bounds.min[0]) * (bounds.max[2] - bounds.min[2])
        };
      });
      runtime.planner = new PlanningNaturalVegetation(plan, height, fields, population, assets, presentation);
      runtime.population = population;
      runtime.height = height;
      runtime.plantAssets = assets;
      const editablePlants = planningEditablePlants(plan, height, assets);
      // Pending placement candidates are not validated trees and need no entities.
      // Existing transaction staging creates newly revealed instances on demand.
      for (const instance of editablePlants) {
        const plant = runtime.plant(runtime.treeRoot, instance, instance.layerId === "乔木");
        runtime.trees.push(plant);
        runtime.treePool.set(instance.id, plant);
      }
      // Initial nearby cells are ready before publication; later cells retain the same deterministic identities.
      runtime.update(0);
      while (runtime.detailTask && !runtime.error) {
        await runtime.detailTask;
        runtime.update(0);
      }
      if (runtime.error) throw new Error(runtime.error);
      return runtime;
    } catch (error) {
      runtime.dispose();
      throw error;
    }
  }
  /** Stage per-instance procedural meshes; commit preserves placement and pick identity. */
  async prepareRocks(
    client: RockFormationClient,
    settings: RockFormationSettings,
    signal: AbortSignal,
    generationProfile: RockGenerationProfile = ROCK_GENERATION_DEFAULTS
  ) {
    if (this.disposed) throw new Error("Native vegetation is disposed");
    signal.throwIfAborted();
    const previous = this.rockSources;
    const profile = { ...generationProfile };
    const rebind = (next: NonNullable<typeof this.rockSources>) => {
      for (const cell of this.cells.values())
        for (const plant of cell.plants) {
          const source = next.forInstance(plant.instance, profile);
          if (!source) continue;
          const original = source.rendererBindings[0].renderer;
          for (const batch of plant.pickBatches) {
            batch.renderer.mesh = original.mesh;
            batch.renderer.setMaterials([...original.getMaterials()]);
            const scale = plant.instance.scaleAxes ?? [
              plant.instance.scale,
              plant.instance.scale,
              plant.instance.scale
            ];
            batch.renderer.shaderData.setFloat(
              "renderer_RockTextureScale",
              Math.max(...source.geometrySize!.map((size, axis) => size * scale[axis])) / 2
            );
          }
        }
    };
    if (previous?.settingsKey === companionRockGeometryKey(settings, profile)) {
      await previous.prepareInstances(
        [...this.cells.values()].flatMap((c) => c.plants.map((p) => p.instance)),
        profile
      );
      signal.throwIfAborted();
      let consumed = false;
      return {
        commit: () => {
          if (consumed || this.disposed || this.rockSources !== previous) throw new Error("Stale companion rock frame");
          consumed = true;
          if (this.rockGenerationProfile.platformShare !== profile.platformShare) rebind(previous);
          this.rockGenerationProfile = profile;
          previous.setTextureScale(settings.textureScale);
          previous.setColorBlend(settings.colorBlend);
        },
        discard: () => {
          consumed = true;
        }
      };
    }
    const next = await createCompanionRockSources(
      this.resourceRoot,
      this.library.stonePlacements,
      this.plan.parameters.seed,
      client,
      settings,
      signal,
      profile,
      this.rockGrassAppearance
    );
    try {
      await next.prepareInstances(
        [...this.cells.values()].flatMap((c) => c.plants.map((p) => p.instance)),
        profile
      );
      signal.throwIfAborted();
    } catch (error) {
      next.dispose();
      throw error;
    }
    if (this.disposed) {
      next.dispose();
      throw new Error("Native vegetation is disposed");
    }
    let consumed = false;
    return {
      commit: () => {
        if (consumed || this.disposed || this.rockSources !== previous) throw new Error("Stale companion rock frame");
        consumed = true;
        this.sources = this.sources.map((sources) => new Map([...sources, ...next.sources]));
        rebind(next);
        this.rockGenerationProfile = profile;
        this.rockSources = next;
        previous?.dispose();
      },
      discard: () => {
        if (!consumed) {
          consumed = true;
          next.dispose();
        }
      }
    };
  }

  /** Resident and subsequently streamed instances share the source material. */
  setRockTextureScale(textureScale: number): void {
    this.rockSources?.setTextureScale(textureScale);
  }

  /** Project a reveal or explicit instance edit onto resident trees.
   * Retained objects keep their renderers; hidden objects can be revealed again without allocation.
   * Associated understory is regenerated only in cells touched by changed anchors.
   */
  async prepareTrees(
    plan: IslandPlan,
    signal?: AbortSignal
  ): Promise<{
    commit(): void;
    discard(): void;
    metrics: { created: number; retained: number; hidden: number; transformed: number };
  }> {
    if (this.disposed) throw new Error("Native vegetation is disposed");
    signal?.throwIfAborted();
    const instances = planningEditablePlants(plan, this.height, this.plantAssets);
    let stagedRoot: Entity | undefined;
    const stage = () => {
      if (!stagedRoot) {
        stagedRoot = this.treeRoot.createChild("Prepared tree edit");
        stagedRoot.isActive = false;
      }
      return stagedRoot;
    };
    const created: Plant[] = [];
    const nextPlanner = new PlanningNaturalVegetation(
      plan,
      this.height,
      this.groundingFields,
      this.population,
      this.plantAssets,
      this.presentation
    );
    nextPlanner.setGroundExclusions([...this.groundExclusions.values()].flat());
    const oldAnchors = new Map(this.planner.anchors.map((anchor) => [anchor.id, anchor]));
    const newAnchors = new Map(nextPlanner.anchors.map((anchor) => [anchor.id, anchor]));
    const affected = [...new Set([...oldAnchors.keys(), ...newAnchors.keys()])].flatMap((id) => {
      const before = oldAnchors.get(id),
        after = newAnchors.get(id);
      if (JSON.stringify(before) === JSON.stringify(after)) return [];
      return [before, after]
        .filter((anchor) => !!anchor)
        .map((anchor) => {
          const reach = companionAnchorReach(anchor.radius, NATURAL_VEGETATION_COMPANION_PATCHES);
          return { x: anchor.position[0], z: anchor.position[2], reach };
        });
    });
    const replacements = new Map<string, Cell>();
    const updates: {
      plant: Plant;
      instance: LandscapePlantInstance;
      ground: number;
      transformed: boolean;
      appearance?: { renderer: MeshRenderer; color: Vector4; proceduralLeaf: boolean }[];
    }[] = [];
    try {
      for (const instance of instances) {
        const retained = this.treePool.get(instance.id);
        const plant =
          retained?.instance.assetId === instance.assetId
            ? retained
            : this.plant(stage(), instance, instance.layerId === "乔木");
        if (plant !== retained) created.push(plant);
        const before = plant.instance;
        let transformed =
          plant !== retained ||
          before.yaw !== instance.yaw ||
          before.scale !== instance.scale ||
          before.position.some((value, index) => value !== instance.position[index]) ||
          JSON.stringify(before.scaleAxes) !== JSON.stringify(instance.scaleAxes);
        const ground =
          transformed || !plant.root.isActive
            ? naturalPlantGroundHeight(this.groundingFields, instance, this.sources[0].get(instance.assetId))
            : plant.groundHeight;
        transformed ||= plant.root.transform.position.y !== ground;
        // Regional colour follows the edited location through the same native
        // bindings as initial publication. Stage uniforms; retain every renderer.
        const appearance =
          JSON.stringify(before.appearance) !== JSON.stringify(instance.appearance)
            ? this.sources
                .flatMap((level) => level.get(instance.assetId)!.rendererBindings)
                .slice(0, plant.pickBatches.length)
                .map((binding, index) => ({
                  renderer: plant.pickBatches[index].renderer,
                  color: this.plantColor(instance, binding),
                  proceduralLeaf: !!binding.renderer.shaderData.getVector4("renderer_ProceduralTreeLeafColor")
                }))
            : undefined;
        updates.push({ plant, instance, transformed, ground, appearance });
      }
      const size = SEED_WORLD_POPULATION_RUNTIME_PROFILE.cellMetres;
      for (const key of this.cells.keys()) {
        const [x, z] = key.split("/").map(Number);
        if (
          !affected.some(
            (a) =>
              a.x + a.reach >= x * size &&
              a.x - a.reach <= (x + 1) * size &&
              a.z + a.reach >= z * size &&
              a.z - a.reach <= (z + 1) * size
          )
        )
          continue;
        signal?.throwIfAborted();
        const result = nextPlanner.compileCell(x, z),
          root = stage().createChild(`Natural cell ${key}`);
        await this.rockSources?.prepareInstances(result.instances, this.rockGenerationProfile);
        replacements.set(key, {
          root,
          plants: result.instances.map((instance) => this.plant(root, instance, false)),
          counts: result.diagnostics.layers,
          populations: result.diagnostics.populations,
          decorations: result.diagnostics.decorations,
          visibilityRejected: result.diagnostics.rejected.visibility ?? 0
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      signal?.throwIfAborted();
    } catch (error) {
      if (stagedRoot) destroyTree(stagedRoot);
      throw error;
    }
    const activeIds = new Set(instances.map((instance) => instance.id));
    const hidden = this.trees.filter((plant) => !activeIds.has(plant.instance.id));
    let consumed = false;
    return {
      metrics: {
        created: created.length,
        retained: instances.length - created.length,
        hidden: hidden.length,
        transformed: updates.filter((update) => update.transformed).length
      },
      commit: () => {
        if (consumed || this.disposed) throw new Error("Stale native tree edit");
        signal?.throwIfAborted();
        for (const plant of hidden) plant.root.isActive = false;
        for (const { plant, instance, ground, transformed, appearance } of updates) {
          const old = this.treePool.get(instance.id);
          if (old && old !== plant) destroyTree(old.root);
          if (stagedRoot && plant.root.parent === stagedRoot) this.treeRoot.addChild(plant.root);
          for (const update of appearance ?? [])
            applyPlantRendererColor(update.renderer, update.color, update.proceduralLeaf);
          plant.instance = instance;
          plant.groundHeight = ground;
          if (transformed) {
            plant.root.transform.setPosition(instance.position[0], ground, instance.position[2]);
            plant.root.transform.setRotation(0, instance.yaw, 0);
            plant.root.transform.setScale(
              ...(instance.scaleAxes ?? ([instance.scale, instance.scale, instance.scale] as const))
            );
            if (plant.grassRootPositions.length) {
              const bounds = this.sources[0].get(instance.assetId)!.bounds;
              const height = (bounds.max[1] - bounds.min[1]) * (instance.scaleAxes?.[1] ?? instance.scale);
              for (const root of plant.grassRootPositions)
                root.set(instance.position[0], ground, instance.position[2], height);
            }
          }
          if (transformed || !plant.root.isActive) plant.lod.setAuthoringVisible(!this.groundExcluded(instance));
          plant.root.isActive = true;
          this.treePool.set(instance.id, plant);
        }
        this.trees.length = 0;
        for (const { plant } of updates) this.trees.push(plant);
        this.plan = plan;
        this.planner = nextPlanner;
        for (const [key, cell] of replacements) {
          const previous = this.cells.get(key);
          this.detailRoot.addChild(cell.root);
          this.cells.set(key, cell);
          if (previous) destroyTree(previous.root);
        }
        this.treeRegions = undefined;
        this.foliageColors = undefined;
        this.barkColors = undefined;
        consumed = true;
        if (stagedRoot) destroyTree(stagedRoot);
      },
      discard: () => {
        if (!consumed) {
          consumed = true;
          if (stagedRoot) destroyTree(stagedRoot);
        }
      }
    };
  }
  private plantColor(instance: LandscapePlantInstance, binding: Source["rendererBindings"][number]): Vector4 {
    const source = binding.renderer.shaderData.getVector4("renderer_AssetAssemblyColor");
    return new Vector4(
      ...resolvePlantMaterialColor(
        this.materialParameters,
        instance.assetId,
        binding.materialId,
        [source.x, source.y, source.z],
        instance.appearance,
        binding.authoredColorScale
      ),
      source.w
    );
  }
  private sourceForPlant(instance: LandscapePlantInstance, level: number): Source {
    return (
      this.rockSources?.forInstance(instance, this.rockGenerationProfile) ?? this.sources[level].get(instance.assetId)!
    );
  }
  private plant(owner: Entity, instance: LandscapePlantInstance, tree: boolean, fields = this.groundingFields): Plant {
    const root = owner.createChild(instance.id),
      source = this.sourceForPlant(instance, 0);
    const profile = SEED_WORLD_POPULATION_RUNTIME_PROFILE;
    const shadows = tree
      ? profile.tree.shadows
      : source.entry.category === "Trees"
        ? profile.shrub.shadows
        : profile.shadows;
    const ground = naturalPlantGroundHeight(fields, instance, source);
    const groundHeight = this.preparedGroundingFields
      ? naturalPlantGroundHeight(this.preparedGroundingFields, instance, source)
      : ground;
    const grassRootPositions: Vector4[] = [];
    const foliageRenderers: MeshRenderer[] = [];
    const barkRenderers: MeshRenderer[] = [];
    root.transform.setPosition(instance.position[0], ground, instance.position[2]);
    root.transform.setRotation(0, instance.yaw, 0);
    root.transform.setScale(...(instance.scaleAxes ?? ([instance.scale, instance.scale, instance.scale] as const)));
    const b = source.bounds,
      groundingOffset = planningNaturalPlantGroundingOffset(source, plantingHeights.get(instance.assetId));
    const origin = planningNaturalPlantOrigin(source, groundingOffset);
    const group = tree ? this.library.treeRecipes[0].lodGroup : this.library.shrub.lodGroup!;
    const thresholds =
      source.transitionHeights ??
      this.catalogSources?.transitionHeights.get(instance.assetId) ??
      (tree
        ? resolveSeedWorldTreeTransitionHeights(group.screenRelativeTransitionHeights)
        : group.screenRelativeTransitionHeights);
    const pickBatches: SeedWorldArrayPickBatch[] = [];
    const pickId = resolvePlanningNaturalPlantPick(instance, tree);
    const lods = thresholds.map((screenRelativeTransitionHeight, level) => {
      const specimen = this.sourceForPlant(instance, level);
      const renderers = specimen.rendererBindings.map((binding, index) => {
        const { renderer: original, materialId } = binding;
        const name = `LOD${level}-${index}`,
          child = root.createChild(name),
          renderer = child.addComponent(MeshRenderer);
        const local = new Matrix();
        Matrix.multiply(origin, original.entity.transform.worldMatrix, local);
        child.transform.localMatrix = local;
        renderer.mesh = original.mesh;
        renderer.setMaterials([...original.getMaterials()]);
        original.shaderData.cloneTo(renderer.shaderData);
        if (source.kind === "stone") {
          const scale = instance.scaleAxes ?? [instance.scale, instance.scale, instance.scale];
          renderer.shaderData.enableMacro("RENDERER_ROCK_TEXTURE_SCALE");
          renderer.shaderData.setFloat(
            "renderer_RockTextureScale",
            Math.max(...source.geometrySize!.map((size, axis) => size * scale[axis])) / 2
          );
        }
        const authoredChannels = plantMaterialColorOverrideMask(this.materialParameters, instance.assetId, materialId);
        for (const [index, channel] of ["R", "G", "B"].entries()) {
          const macro = `RENDERER_PLANT_COLOR_OVERRIDE_${channel}`;
          if (authoredChannels[index]) renderer.shaderData.enableMacro(macro);
          else renderer.shaderData.disableMacro(macro);
        }
        if (original.getMaterials().some((material) => material && this.grassMaterials.has(material))) {
          if (
            original
              .getMaterials()
              .some((material) =>
                material?.shaderData
                  .getMacros()
                  .some((macro) => macro.name === "MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE")
              )
          ) {
            const height = (b.max[1] - b.min[1]) * (instance.scaleAxes?.[1] ?? instance.scale);
            const grassRoot = new Vector4(instance.position[0], ground, instance.position[2], height);
            grassRootPositions.push(grassRoot);
            renderer.shaderData.setVector4("renderer_GrassRootPositionHeight", grassRoot);
          }
          renderer.shaderData.setVector3(
            "renderer_GrassColorOverrideMask",
            new Vector3(...plantMaterialColorOverrideMask(this.materialParameters, instance.assetId, materialId))
          );
        }
        applyPlantRendererColor(
          renderer,
          this.plantColor(instance, binding),
          !!original.shaderData.getVector4("renderer_ProceduralTreeLeafColor")
        );
        const role = PLANT_SPECIES_MATERIALS[instance.assetId]?.[materialId]?.role;
        if (
          level === 0 &&
          !PLANT_GROUND_COVER_VARIATIONS.has(instance.assetId) &&
          (role === "leaf" || role === "shrub")
        )
          foliageRenderers.push(renderer);
        if (level === 0 && role === "bark") barkRenderers.push(renderer);
        renderer.enableVertexColor = original.enableVertexColor;
        renderer.castShadows = source.kind === "stone" ? original.castShadows : shadows.castShadows;
        renderer.receiveShadows = source.kind === "stone" ? original.receiveShadows : shadows.receiveShadows;
        const pick = new SeedWorldArrayPickBatch(renderer);
        pick.count = 1;
        pick.id = pickId;
        pickBatches.push(pick);
        const normal = new Matrix();
        Matrix.invert(local, normal);
        Matrix.transpose(normal, normal);
        return {
          entityPath: [root.children.length - 1],
          componentIndex: 0,
          mesh: renderer.mesh as ModelMesh,
          material: renderer.getMaterial()!,
          localMatrix: local,
          localNormalMatrix: normal,
          castShadows: renderer.castShadows,
          receiveShadows: renderer.receiveShadows,
          enableVertexColor: renderer.enableVertexColor,
          detailInstancing: false,
          billboardInstancing: false
        };
      });
      return { screenRelativeTransitionHeight, fadeTransitionWidth: 0, renderers };
    });
    const size = Math.max(...b.max.map((v, axis) => v - b.min[axis]));
    const lod = new TerrainLodGroupRendererRuntime(
      root,
      this.camera,
      {
        fadeMode: "CrossFade",
        animateCrossFading: true,
        localReferencePoint: [0, (b.max[1] - b.min[1]) / 2 + groundingOffset, 0],
        size,
        lods
      },
      source.kind === "stone" ? 0 : SEED_WORLD_POPULATION_RUNTIME_PROFILE.tree.crossFadeSeconds
    );
    lod.setAuthoringVisible(!this.groundExcluded(instance));
    return { root, lod, instance, pickBatches, groundHeight, grassRootPositions, foliageRenderers, barkRenderers };
  }

  private groundExcluded(instance: LandscapePlantInstance): boolean {
    const b = this.sources[0].get(instance.assetId)!.bounds;
    const scale = instance.scaleAxes ?? [instance.scale, instance.scale, instance.scale];
    const footprint = envelope(
      { x: instance.position[0], z: instance.position[2] },
      (b.max[0] - b.min[0]) * scale[0],
      (b.max[2] - b.min[2]) * scale[2],
      (instance.yaw * Math.PI) / 180
    );
    for (const areas of this.groundExclusions.values())
      for (const area of areas) if (overlap(footprint, area)) return true;
    return false;
  }

  /** Host occupancy is a reversible view overlay; it never edits ecology authoring or plant identities. */
  setGroundExclusions(owner: string, outlines: readonly (readonly PlanPoint[])[]): void {
    if (this.disposed) throw new Error("Native vegetation is disposed");
    if (!owner.trim()) throw new Error("Ground exclusion owner is required");
    const previous = this.groundExclusions.get(owner) ?? [];
    const owned = outlines.map((outline) => outline.map((p) => ({ ...p })));
    if (JSON.stringify(previous) === JSON.stringify(owned)) return;
    if (
      owned.some((outline) => outline.length < 3 || outline.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z)))
    )
      throw new Error("Invalid occupied ground polygon");
    const beforeKeys = new Set(previous.map((outline) => JSON.stringify(outline)));
    const afterKeys = new Set(owned.map((outline) => JSON.stringify(outline)));
    const changed = [
      ...previous.filter((outline) => !afterKeys.has(JSON.stringify(outline))),
      ...owned.filter((outline) => !beforeKeys.has(JSON.stringify(outline)))
    ];
    if (owned.length) this.groundExclusions.set(owner, owned);
    else this.groundExclusions.delete(owner);
    // Gameplay occupancy masks canonical instances, including those in future
    // streamed cells. Feeding it back into the solver destroys stable neighbours
    // and forces whole 64m cells to be compiled and instantiated at tool commit.
    const bounds = changed.map((outline) => ({
      minX: Math.min(...outline.map((p) => p.x)),
      maxX: Math.max(...outline.map((p) => p.x)),
      minZ: Math.min(...outline.map((p) => p.z)),
      maxZ: Math.max(...outline.map((p) => p.z))
    }));
    const refresh = (plant: Plant) => {
      const { instance } = plant,
        b = this.sources[0].get(instance.assetId)!.bounds;
      const sx = instance.scaleAxes?.[0] ?? instance.scale,
        sz = instance.scaleAxes?.[2] ?? instance.scale;
      // A yaw-independent envelope is only a broad phase; the exact footprint
      // predicate still decides visibility, including overlap with other owners.
      const radius = Math.hypot((b.max[0] - b.min[0]) * sx, (b.max[2] - b.min[2]) * sz) / 2 + 0.01;
      const [x, , z] = instance.position;
      if (
        bounds.some((b) => x + radius >= b.minX && x - radius <= b.maxX && z + radius >= b.minZ && z - radius <= b.maxZ)
      )
        plant.lod.setAuthoringVisible(!this.groundExcluded(instance));
    };
    for (const tree of this.trees) refresh(tree);
    for (const cell of this.cells.values()) for (const plant of cell.plants) refresh(plant);
    if (this.error) throw new Error(this.error);
  }
  update(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    const position = this.camera.entity.transform.worldPosition;
    for (const tree of this.trees) tree.lod.updateRenderers(this.time);
    if (this.error) return;
    const profile = SEED_WORLD_POPULATION_RUNTIME_PROFILE,
      cellSize = profile.cellMetres;
    const distance = profile.detail.materialFade.maximumDistanceMetres;
    const retain = profile.detail.prefetchDistanceMetres;
    const wanted: { key: string; x: number; z: number; distance: number }[] = [];
    const minX = Math.max(0, Math.floor((position.x - distance) / cellSize));
    const maxX = Math.min(
      Math.ceil(this.plan.parameters.width / cellSize) - 1,
      Math.floor((position.x + distance) / cellSize)
    );
    const minZ = Math.max(0, Math.floor((position.z - distance) / cellSize));
    const maxZ = Math.min(
      Math.ceil(this.plan.parameters.depth / cellSize) - 1,
      Math.floor((position.z + distance) / cellSize)
    );
    const cellDistance = (x: number, z: number) =>
      Math.hypot(
        Math.max(x * cellSize - position.x, 0, position.x - (x + 1) * cellSize),
        Math.max(z * cellSize - position.z, 0, position.z - (z + 1) * cellSize)
      );
    for (let z = minZ; z <= maxZ; z++)
      for (let x = minX; x <= maxX; x++) {
        const d = cellDistance(x, z);
        if (d <= distance) wanted.push({ key: `${x}/${z}`, x, z, distance: d });
      }
    wanted.sort((a, b) => a.distance - b.distance);
    for (const [key, cell] of this.cells) {
      const [x, z] = key.split("/").map(Number);
      if (cellDistance(x, z) > retain) {
        destroyTree(cell.root);
        this.cells.delete(key);
        this.rockSources?.releaseInstances(cell.plants.map((p) => p.instance));
        this.foliageColors = undefined;
      }
    }
    const item = wanted.find((item) => !this.cells.has(item.key));
    if (item && !this.detailTask && !this.error) {
      const planner = this.planner,
        rocks = this.rockSources;
      const load = async () => {
        const result = planner.compileCell(item.x, item.z);
        await rocks?.prepareInstances(result.instances, this.rockGenerationProfile);
        if (this.disposed || this.planner !== planner || this.rockSources !== rocks) return;
        const root = this.detailRoot.createChild(`Natural cell ${item.key}`);
        try {
          const plants = result.instances.map((instance) => this.plant(root, instance, false));
          this.cells.set(item.key, {
            root,
            plants,
            counts: result.diagnostics.layers,
            populations: result.diagnostics.populations,
            decorations: result.diagnostics.decorations,
            visibilityRejected: result.diagnostics.rejected.visibility ?? 0
          });
          this.foliageColors = undefined;
        } catch (error) {
          destroyTree(root);
          throw error;
        }
      };
      this.detailTask = load()
        .catch((error) => {
          if (this.disposed || this.planner !== planner || this.rockSources !== rocks) return;
          this.error = String(error);
          console.error("[planning-natural-vegetation]", error);
        })
        .finally(() => {
          this.detailTask = undefined;
        });
    }
    for (const cell of this.cells.values())
      for (const plant of cell.plants) {
        const p = plant.instance.position;
        plant.lod.updateRenderers(this.time, Math.hypot(p[0] - position.x, p[2] - position.z) <= distance);
      }
  }
  /** Detached replacements for changed woody plants and affected resident/visible understory cells. */
  async prepareWaterImpact(
    plan: IslandPlan,
    height: PlanningHeightmap,
    fields: SeedWorldFields,
    population: SeedWorldPopulationPreview,
    bounds: SeedWorldAuthoringRuntimeBoundsV1,
    signal: AbortSignal
  ): Promise<PreparedTerrainUpdate> {
    if (this.disposed) throw Error("Vegetation is disposed");
    signal.throwIfAborted();
    const previous = {
      plan: this.plan,
      height: this.height,
      fields: this.groundingFields,
      population: this.population,
      planner: this.planner,
      trees: [...this.trees],
      pool: new Map(this.treePool),
      cells: new Map(this.cells)
    };
    const nextPlanner = new PlanningNaturalVegetation(
      plan,
      height,
      fields,
      population,
      this.plantAssets,
      this.presentation
    );
    nextPlanner.setGroundExclusions([...this.groundExclusions.values()].flat());
    const stage = this.owner.createChild("Prepared water vegetation");
    stage.isActive = false;
    const inside = (x: number, z: number, margin = 0) =>
      x >= bounds.minimumX - margin &&
      x <= bounds.maximumX + margin &&
      z >= bounds.minimumZ - margin &&
      z <= bounds.maximumZ + margin;
    const desired = planningEditablePlants(plan, height, this.plantAssets),
      nextTrees: Plant[] = [],
      created: Plant[] = [];
    const replacements = new Map<string, Cell>();
    const cellSize = SEED_WORLD_POPULATION_RUNTIME_PROFILE.cellMetres;
    try {
      for (const instance of desired) {
        const old = this.treePool.get(instance.id),
          source = this.sources[0].get(instance.assetId);
        const ground = naturalPlantGroundHeight(fields, instance, source);
        if (old && JSON.stringify(old.instance) === JSON.stringify(instance) && old.groundHeight === ground)
          nextTrees.push(old);
        else {
          const plant = this.plant(stage, instance, instance.layerId === "乔木", fields);
          created.push(plant);
          nextTrees.push(plant);
        }
      }
      const keys = new Set(this.cells.keys());
      const position = this.camera.entity.transform.worldPosition;
      const distance = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.materialFade.maximumDistanceMetres;
      for (
        let z = Math.max(0, Math.floor((position.z - distance) / cellSize));
        z <= Math.min(Math.ceil(plan.parameters.depth / cellSize) - 1, Math.floor((position.z + distance) / cellSize));
        z++
      )
        for (
          let x = Math.max(0, Math.floor((position.x - distance) / cellSize));
          x <=
          Math.min(Math.ceil(plan.parameters.width / cellSize) - 1, Math.floor((position.x + distance) / cellSize));
          x++
        )
          keys.add(`${x}/${z}`);
      for (const key of keys) {
        const [x, z] = key.split("/").map(Number);
        if (!inside((x + 0.5) * cellSize, (z + 0.5) * cellSize, cellSize / 2)) continue;
        signal.throwIfAborted();
        const result = nextPlanner.compileCell(x, z),
          root = stage.createChild(`Natural cell ${key}`);
        await this.rockSources?.prepareInstances(result.instances, this.rockGenerationProfile);
        const plants = result.instances.map((instance) => this.plant(root, instance, false, fields));
        replacements.set(key, {
          root,
          plants,
          counts: result.diagnostics.layers,
          populations: result.diagnostics.populations,
          decorations: result.diagnostics.decorations,
          visibilityRejected: result.diagnostics.rejected.visibility ?? 0
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      signal.throwIfAborted();
    } catch (error) {
      destroyTree(stage);
      throw error;
    }
    let state: "prepared" | "committed" | "finished" = "prepared";
    const retiredTrees = previous.trees.filter((tree) => !nextTrees.includes(tree));
    const oldActivity = new Map(
      [
        ...retiredTrees.map((t) => t.root),
        ...nextTrees.filter((t) => !t.root.isActive).map((t) => t.root),
        ...[...replacements.keys()].flatMap((k) => previous.cells.get(k)?.root ?? [])
      ].map((root) => [root, root.isActive])
    );
    const resetDiagnostics = () => {
      this.treeRegions = undefined;
      this.foliageColors = undefined;
      this.barkColors = undefined;
    };
    const rollback = () => {
      if (state !== "committed") return;
      const errors: unknown[] = [];
      for (const root of [...created.map((p) => p.root), ...[...replacements.values()].map((c) => c.root)])
        try {
          root.isActive = false;
        } catch (error) {
          errors.push(error);
        }
      for (const [root, active] of oldActivity)
        try {
          root.isActive = active;
        } catch (error) {
          errors.push(error);
        }
      this.trees.splice(0, this.trees.length, ...previous.trees);
      this.treePool.clear();
      for (const [id, tree] of previous.pool) this.treePool.set(id, tree);
      for (const key of replacements.keys()) {
        const old = previous.cells.get(key);
        if (old) this.cells.set(key, old);
        else this.cells.delete(key);
      }
      this.plan = previous.plan;
      this.height = previous.height;
      this.groundingFields = previous.fields;
      this.population = previous.population;
      this.planner = previous.planner;
      resetDiagnostics();
      state = "prepared";
      if (errors.length) throw new AggregateError(errors, "Vegetation visibility rollback failed");
    };
    return {
      commit: () => {
        if (
          state !== "prepared" ||
          this.disposed ||
          this.plan !== previous.plan ||
          [...replacements.keys()].some((k) => this.cells.get(k) !== previous.cells.get(k))
        )
          throw Error("Stale water vegetation");
        signal.throwIfAborted();
        state = "committed";
        try {
          for (const root of oldActivity.keys()) root.isActive = false;
          for (const plant of created) {
            this.treeRoot.addChild(plant.root);
            plant.root.isActive = true;
          }
          for (const [key, cell] of replacements) {
            this.detailRoot.addChild(cell.root);
            cell.root.isActive = true;
            this.cells.set(key, cell);
          }
          for (const tree of nextTrees) if (!tree.root.isActive) tree.root.isActive = true;
          this.trees.splice(0, this.trees.length, ...nextTrees);
          for (const tree of nextTrees) this.treePool.set(tree.instance.id, tree);
          for (const tree of retiredTrees)
            if (!nextTrees.some((next) => next.instance.id === tree.instance.id))
              this.treePool.delete(tree.instance.id);
          this.plan = plan;
          this.height = height;
          this.groundingFields = fields;
          this.population = population;
          this.planner = nextPlanner;
          resetDiagnostics();
        } catch (error) {
          rollback();
          throw error;
        }
      },
      rollback,
      finalize: () => {
        if (state !== "committed") throw Error("Vegetation patch not committed");
        state = "finished";
        for (const tree of retiredTrees) destroyTree(tree.root);
        for (const key of replacements.keys()) {
          const old = previous.cells.get(key);
          if (old) destroyTree(old.root);
        }
        destroyTree(stage);
      },
      discard: () => {
        if (state === "finished") return;
        rollback();
        state = "finished";
        for (const tree of created) destroyTree(tree.root);
        for (const cell of replacements.values()) destroyTree(cell.root);
        destroyTree(stage);
      }
    };
  }

  /** Stage vertical anchors against the same immutable terrain frame as buildings and solids.
   * Plant identities, XZ, species proportions, scale and streamed cell membership are retained.
   * Heights are stored on existing plants; preparation allocates no per-plant arrays or renderers.
   */
  prepareGrounding(fields: SeedWorldFields, signal?: AbortSignal): { commit(): void; discard(): void } {
    if (this.disposed) throw new Error("Native vegetation is disposed");
    if (this.preparedGroundingFields) throw new Error("Native vegetation grounding is already prepared");
    signal?.throwIfAborted();
    this.preparedGroundingFields = fields;
    try {
      for (const tree of this.trees)
        tree.groundHeight = naturalPlantGroundHeight(fields, tree.instance, this.sources[0].get(tree.instance.assetId));
      for (const cell of this.cells.values())
        for (const plant of cell.plants)
          plant.groundHeight = naturalPlantGroundHeight(
            fields,
            plant.instance,
            this.sources[0].get(plant.instance.assetId)
          );
    } catch (error) {
      this.preparedGroundingFields = undefined;
      throw error;
    }
    let consumed = false;
    return {
      commit: () => {
        if (consumed) throw new Error("Native vegetation grounding already consumed");
        if (this.disposed) throw new Error("Native vegetation is disposed");
        signal?.throwIfAborted();
        for (const tree of this.trees) commitPlantGrounding(tree);
        for (const cell of this.cells.values()) for (const plant of cell.plants) commitPlantGrounding(plant);
        this.groundingFields = fields;
        this.preparedGroundingFields = undefined;
        consumed = true;
      },
      discard: () => {
        if (consumed) return;
        this.preparedGroundingFields = undefined;
        consumed = true;
      }
    };
  }
  /** LOD visibility stays renderer-owned; descriptor identities survive every LOD transition. */
  visitPickBatches(visitor: SeedWorldPickVisitor): void {
    if (this.disposed) return;
    for (const tree of this.trees) visitPlantPickBatches(tree, visitor);
    for (const cell of this.cells.values()) for (const plant of cell.plants) visitPlantPickBatches(plant, visitor);
  }
  getAuthoringSnapshot() {
    return {
      trees: this.trees.map((plant) => ({
        ...plant.instance,
        position: [plant.instance.position[0], plant.root.transform.position.y, plant.instance.position[2]] as [
          number,
          number,
          number
        ]
      })),
      authoredPlantIds: (this.plan.authoredResources ?? [])
        .filter(
          (resource) =>
            resource.resourceType === "vegetation-brush" &&
            resource.properties.distributionKind === "single" &&
            ["tree", "shrub"].includes(resource.properties.category)
        )
        .map((resource) => resource.resourceId),
      flowers: this.plan.flowerRegions ?? [],
      seed: this.plan.parameters.seed
    };
  }
  getDiagnostics() {
    const layers: Record<string, number> = {};
    const flowerAssets: Record<string, number> = {};
    if (!this.treeRegions) {
      this.treeRegions = {};
      const speciesAt = createNaturalTreeSpeciesRegions(this.plan.parameters.seed);
      const groups = new Map(PLANT_TREE_SPECIES.map((species) => [species.assetId, species.speciesGroup]));
      for (const { instance } of this.trees) {
        if (instance.layerId !== "乔木") continue;
        const region = speciesAt([instance.position[0], instance.position[2]], instance.id);
        const entry = (this.treeRegions[region.regionId] ??= {
          dominantGroup: region.dominantGroup,
          species: {},
          interior: 0,
          interiorOtherSpecies: 0,
          boundary: 0
        });
        entry.species[instance.assetId] = (entry.species[instance.assetId] ?? 0) + 1;
        if (region.secondaryWeight > 0) entry.boundary++;
        else {
          entry.interior++;
          if (groups.get(instance.assetId) !== region.dominantGroup) entry.interiorOtherSpecies++;
        }
      }
    }
    const treeSpecies: Record<string, number> = {};
    for (const tree of this.trees) {
      layers[tree.instance.layerId] = (layers[tree.instance.layerId] ?? 0) + 1;
      if (tree.instance.layerId === "乔木")
        treeSpecies[tree.instance.assetId] = (treeSpecies[tree.instance.assetId] ?? 0) + 1;
    }
    // Actual renderer inputs, before lighting/season. This also covers source-part and explicit material colours.
    const foliageColors = this.foliageColors ?? {};
    const barkColors = this.foliageColors ? this.barkColors! : {};
    const recordColors = (plant: Plant, role: "foliage" | "bark") => {
      const renderers = role === "foliage" ? plant.foliageRenderers : plant.barkRenderers;
      if (!renderers.length) return;
      const gain = plant.instance.appearance?.[role]?.brightness ?? 1;
      const colors = role === "foliage" ? foliageColors : barkColors;
      const entry = (colors[plant.instance.assetId] ??= {
        plants: 0,
        brightness: [gain, gain],
        rendererLuminance: [Infinity, -Infinity],
        chromaticity: [
          [Infinity, -Infinity],
          [Infinity, -Infinity],
          [Infinity, -Infinity]
        ]
      });
      entry.plants++;
      entry.brightness[0] = Math.min(entry.brightness[0], gain);
      entry.brightness[1] = Math.max(entry.brightness[1], gain);
      for (const renderer of renderers) {
        const color =
          (role === "foliage" ? renderer.shaderData.getVector4("renderer_ProceduralTreeLeafColor") : undefined) ??
          renderer.shaderData.getVector4("renderer_AssetAssemblyColor");
        const luminance = color.x * 0.2126 + color.y * 0.7152 + color.z * 0.0722;
        entry.rendererLuminance[0] = Math.min(entry.rendererLuminance[0], luminance);
        entry.rendererLuminance[1] = Math.max(entry.rendererLuminance[1], luminance);
        for (const [axis, value] of [color.x, color.y, color.z].entries()) {
          const normalized = luminance > 0 ? value / luminance : 0;
          entry.chromaticity[axis][0] = Math.min(entry.chromaticity[axis][0], normalized);
          entry.chromaticity[axis][1] = Math.max(entry.chromaticity[axis][1], normalized);
        }
      }
    };
    if (!this.foliageColors) {
      const record = (plant: Plant) => {
        recordColors(plant, "foliage");
        recordColors(plant, "bark");
      };
      for (const tree of this.trees) record(tree);
      for (const cell of this.cells.values()) for (const plant of cell.plants) record(plant);
      // Material colours are immutable for this publication; only streamed residency changes this summary.
      this.foliageColors = foliageColors;
      this.barkColors = barkColors;
    }
    const companionRocks = {
      representation: "procedural",
      meshLods: 1,
      sources: this.rockSources?.specimenCount ?? 0,
      count: 0,
      residentTriangles: 0,
      activeTriangles: 0
    };
    const companionGroups: Record<string, Record<string, number>> = {};
    const speciesSizes: Record<string, { count: number; scaleY: [number, number]; heightM: [number, number] }> = {};
    for (const cell of this.cells.values())
      for (const plant of cell.plants) {
        if (this.rockSources?.forInstance(plant.instance, this.rockGenerationProfile)) {
          companionRocks.count++;
          for (const { renderer } of plant.pickBatches) {
            const triangles = renderer.mesh?.subMeshes.reduce((sum, mesh) => sum + mesh.count / 3, 0) ?? 0;
            companionRocks.residentTriangles += triangles;
            if (renderer.enabled && renderer.entity.isActiveInHierarchy) companionRocks.activeTriangles += triangles;
          }
        }
        if (plant.instance.companionAnchorId) {
          const counts = (companionGroups[plant.instance.companionAnchorId] ??= {});
          counts[plant.instance.layerId] = (counts[plant.instance.layerId] ?? 0) + 1;
        }
        if (plant.instance.layerId === "零星野花")
          flowerAssets[plant.instance.assetId] = (flowerAssets[plant.instance.assetId] ?? 0) + 1;
        const scale = plant.root.transform.scale.y,
          bounds = this.sources[0].get(plant.instance.assetId)!.bounds;
        const height = (bounds.max[1] - bounds.min[1]) * scale;
        const size = (speciesSizes[plant.instance.assetId] ??= {
          count: 0,
          scaleY: [scale, scale],
          heightM: [height, height]
        });
        size.count++;
        size.scaleY[0] = Math.min(size.scaleY[0], scale);
        size.scaleY[1] = Math.max(size.scaleY[1], scale);
        size.heightM[0] = Math.min(size.heightM[0], height);
        size.heightM[1] = Math.max(size.heightM[1], height);
      }
    for (const cell of this.cells.values())
      for (const [key, count] of Object.entries(cell.counts)) layers[key] = (layers[key] ?? 0) + count;
    const flowers = { sampling: "single-pass-field", placed: 0, attempts: 0, rejected: {} as Record<string, number> };
    for (const cell of this.cells.values()) {
      const decoration = cell.decorations?.["零星野花"];
      if (!decoration) continue;
      flowers.placed += decoration.placed;
      flowers.attempts += decoration.attempts;
      for (const [reason, count] of Object.entries(decoration.rejected))
        flowers.rejected[reason] = (flowers.rejected[reason] ?? 0) + count;
    }
    const composition = this.presentation
      ? {
          subjectId: this.presentation.focus.objectId,
          kind: this.presentation.focus.kind,
          visibilityTargets: this.presentation.focus.visibility.length,
          visibilityRejected: [...this.cells.values()].reduce((sum, cell) => sum + cell.visibilityRejected, 0)
        }
      : undefined;
    return {
      mode: "natural-meadow",
      composition,
      flowerPopulation: flowers,
      flowerAssets,
      treeSpecies,
      treeRegions: this.treeRegions,
      trees: layers.乔木 ?? 0,
      residentCells: this.cells.size,
      layers,
      treeSizing: "species-proportions",
      ecology: this.plan.naturalVegetation?.world,
      plantSizes: this.plan.naturalVegetation?.plantSizes,
      speciesSizes,
      foliageColors,
      barkColors,
      groundCoverColors: { source: "grass-field", shading: "plant", brightness: this.groundCoverBrightness },
      companionGroups,
      companionRocks,
      assets: [...(this.sources[0]?.keys() ?? [])],
      materialParameters: this.materialParameters,
      shadows: {
        trees: SEED_WORLD_POPULATION_RUNTIME_PROFILE.tree.shadows,
        shrubs: SEED_WORLD_POPULATION_RUNTIME_PROFILE.shrub.shadows,
        ground: SEED_WORLD_POPULATION_RUNTIME_PROFILE.shadows
      },
      error: this.error
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    destroyTree(this.treeRoot);
    destroyTree(this.detailRoot);
    this.cells.clear();
    this.trees.length = 0;
    this.treePool.clear();
    this.groundExclusions.clear();
    for (const library of this.libraries) library.destroy();
    for (const release of this.releaseGrassAppearance) release();
    this.releaseGrassAppearance.length = 0;
    this.grassMaterials.clear();
    for (const variants of this.groundCoverMaterials.values())
      for (const material of variants.values()) material.destroy();
    this.groundCoverMaterials.clear();
    this.catalogSources?.destroy();
    this.materials?.destroy();
    this.rockSources?.dispose();
    this.resourceRoot.destroy();
  }
}

/** Convert the authored planting plane to the same scaled source space as its LOD0 bounds. */
export function planningNaturalPlantGroundingOffset(
  source: Pick<Source, "entry" | "bounds" | "kind">,
  plantingHeightM?: number
): number {
  if (source.kind === "stone" || plantingHeightM === undefined) return 0;
  return (
    source.bounds.min[1] -
    plantingHeightM * VEGETATION_AUTHORING_REFERENCE_SCALE * (source.entry.instanceScale?.[1] ?? 1)
  );
}

/** Every rendered LOD shares the canonical LOD0 planting origin; changing LOD never replants it. */
export function planningNaturalPlantOrigin(source: Pick<Source, "bounds" | "kind">, groundingOffset = 0): Matrix {
  const origin = new Matrix(),
    b = source.bounds;
  origin.elements[12] = -(b.min[0] + b.max[0]) / 2;
  origin.elements[13] = source.kind === "stone" ? 0 : -b.min[1] + groundingOffset;
  origin.elements[14] = -(b.min[2] + b.max[2]) / 2;
  return origin;
}
function naturalPlantGroundHeight(fields: SeedWorldFields, instance: LandscapePlantInstance, source?: Source): number {
  let height = sampleSeedWorldHeight(fields, instance.position[0], instance.position[2]) ?? instance.position[1];
  if (source?.kind === "stone") {
    const scale = instance.scaleAxes ?? [instance.scale, instance.scale, instance.scale];
    const halfX = ((source.bounds.max[0] - source.bounds.min[0]) * scale[0]) / 2;
    const halfZ = ((source.bounds.max[2] - source.bounds.min[2]) * scale[2]) / 2;
    const yaw = (instance.yaw * Math.PI) / 180,
      cos = Math.cos(yaw),
      sin = Math.sin(yaw);
    // Ground the actual rotated footprint at its lowest corner, matching published solids.
    for (const x of [-halfX, halfX])
      for (const z of [-halfZ, halfZ]) {
        const y = sampleSeedWorldHeight(
          fields,
          instance.position[0] + x * cos + z * sin,
          instance.position[2] - x * sin + z * cos
        );
        if (y === undefined || !Number.isFinite(y)) throw new Error(`Invalid companion stone ground: ${instance.id}`);
        height = Math.min(height!, y);
      }
  }
  if (height === undefined || !Number.isFinite(height)) throw new Error(`Invalid native plant ground: ${instance.id}`);
  return height;
}
function applyPlantRendererColor(renderer: MeshRenderer, color: Vector4, proceduralLeaf: boolean): void {
  renderer.shaderData.setVector4("renderer_AssetAssemblyColor", color);
  if (proceduralLeaf) renderer.shaderData.setVector4("renderer_ProceduralTreeLeafColor", color);
}
function commitPlantGrounding(plant: Plant): void {
  plant.root.transform.setPosition(plant.instance.position[0], plant.groundHeight, plant.instance.position[2]);
  for (const grassRoot of plant.grassRootPositions) grassRoot.y = plant.groundHeight;
}
function visitPlantPickBatches(plant: Plant, visitor: SeedWorldPickVisitor): void {
  for (const batch of plant.pickBatches)
    if (batch.renderer.enabled && batch.renderer.entity.isActiveInHierarchy) visitor(batch);
}
function destroyTree(root: Entity): void {
  for (let i = root.children.length - 1; i >= 0; i--) destroyTree(root.children[i]);
  root.destroy();
}

/** Same expected footprint/coverage conversion as Asset Assembly's native grass mode. */
export function planningNaturalGrassDensity(library: AssetAssemblySourceLibrary): number {
  const binding = library.grass.lods[0].renderer,
    bounds = new BoundingBox();
  BoundingBox.transform(binding.mesh.bounds, binding.localMatrix, bounds);
  const width = bounds.max.x - bounds.min.x,
    depth = bounds.max.z - bounds.min.z;
  const scale = getSeedWorldAssetPlacementProfile("grass").roleScale.field!;
  const area = landscapeGrassPaletteArea(
    [
      {
        assetId: library.grass.id,
        weight: 1,
        horizontalVariation: [DETAIL_HORIZONTAL_SCALE_VARIATION_MINIMUM, DETAIL_HORIZONTAL_SCALE_VARIATION_MAXIMUM]
      }
    ],
    [scale.minimum, scale.maximum],
    [
      {
        id: library.grass.id,
        height: bounds.max.y - bounds.min.y,
        radius: Math.hypot(width, depth) / 2,
        footprintArea: width * depth
      }
    ]
  );
  return -Math.log(1 - LANDSCAPE_GRASS_COVERAGE) / area;
}

/** Placement bounds remain authored; each visible stone is generated from its own stable identity. */
async function createCompanionRockSources(
  parent: Entity,
  variants: readonly AtomicAssemblyPlacement[],
  seed: number,
  client: RockFormationClient,
  settings: RockFormationSettings,
  signal: AbortSignal,
  profile: RockGenerationProfile,
  registerGrassAppearance?: (material: Material) => () => void
) {
  await prepareRockTextures(parent.engine, signal);
  signal.throwIfAborted();
  const root = parent.createChild("Companion procedural rock sources");
  root.isActive = false;
  const lifetime = new AbortController();
  const material = createRockFormationMaterial(parent.engine, settings.textureScale, settings.colorBlend);
  if (registerGrassAppearance) material.shaderData.enableMacro("MATERIAL_GRASS_SHARED_COLOR_FIELD");
  const releaseAppearance = registerGrassAppearance?.(material);
  const placements = new Map(variants.map((v) => [v.id, v]));
  const sources = new Map<string, Source>(
    variants.map((v) => [
      v.id,
      {
        entry: { id: v.id, category: "Rocks" },
        bounds: v.bounds,
        kind: "stone",
        rendererBindings: []
      }
    ])
  );
  const specimens = new Map<string, { source: Source; surface: RockFormationSurface; entity: Entity }>();
  const pending = new Map<string, Promise<void>>();
  const keyFor = (instance: Pick<LandscapePlantInstance, "id" | "assetId">, p: RockGenerationProfile) =>
    `${instance.id}:${rockGenerationKind(seed, instance.id, p)}`;
  const remove = (key: string) => {
    const specimen = specimens.get(key);
    if (!specimen) return;
    specimens.delete(key);
    specimen.entity.destroy();
    specimen.surface.mesh.destroy();
    if (!specimen.surface.buffer.destroyed) specimen.surface.buffer.destroy();
  };
  return {
    root,
    sources,
    settingsKey: companionRockGeometryKey(settings, profile),
    get specimenCount() {
      return specimens.size;
    },
    async prepareInstances(instances: readonly LandscapePlantInstance[], p = profile) {
      await Promise.all(
        instances.map((instance) => {
          const placement = placements.get(instance.assetId);
          if (!placement) return;
          const key = keyFor(instance, p);
          if (specimens.has(key)) return;
          const existing = pending.get(key);
          if (existing) return existing;
          const job = companionRockJob(
            instance.id,
            placement.bounds,
            seed,
            rockGenerationKind(seed, instance.id, p),
            p
          );
          const task = client
            .prepareJobs([job], settings, lifetime.signal)
            .then(([formation]) => {
              lifetime.signal.throwIfAborted();
              const entity = root.createChild(formation.id);
              entity.transform.setPosition(...formation.origin);
              const surface = uploadRockFormationSurface(parent.engine, entity, formation, material);
              if (!surface) {
                entity.destroy();
                throw new Error(`Empty companion rock: ${instance.id}`);
              }
              surface.renderer.shaderData.setVector4("renderer_AssetAssemblyColor", new Vector4(1, 1, 1, 1));
              specimens.set(key, {
                entity,
                surface,
                source: {
                  entry: { id: instance.assetId, category: "Rocks" },
                  bounds: placement.bounds,
                  kind: "stone",
                  geometrySize: job.guides[0].size,
                  transitionHeights: [
                    placement.cullScreenHeight / SEED_WORLD_SURFACE_DETAIL_TERMINAL_DISTANCE_MULTIPLIER
                  ],
                  rendererBindings: [{ renderer: surface.renderer, materialId: "surface" }]
                }
              });
            })
            .finally(() => pending.delete(key));
          pending.set(key, task);
          return task;
        })
      );
    },
    forInstance(
      instance: Pick<LandscapePlantInstance, "id" | "assetId">,
      p: RockGenerationProfile
    ): Source | undefined {
      return specimens.get(keyFor(instance, p))?.source;
    },
    releaseInstances(instances: readonly LandscapePlantInstance[]) {
      for (const instance of instances) for (const kind of COMPANION_ROCK_KINDS) remove(`${instance.id}:${kind}`);
    },
    setColorBlend(value: RockColorBlend) {
      setRockColorBlend(material, value);
    },
    setTextureScale(value: number) {
      setRockTextureScale(material, value);
    },
    dispose() {
      lifetime.abort(new Error("Companion rock sources disposed"));
      for (const key of specimens.keys()) remove(key);
      root.destroy();
      releaseAppearance?.();
      material.destroy();
    }
  };
}
