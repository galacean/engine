import { rockLodScreenHeights } from "@galacean/engine-terrain/rock-formation/RockLodPolicy";
import { prepareRockLodMeshes, rockLodMeshes } from "../../integrations/terrain/rock-formation/RockLodMeshes";
import type { PreparedTerrainUpdate } from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import type { SeedWorldAuthoringRuntimeBoundsV1 } from "../../world/SeedWorldAuthoringRuntimeDelta";
import { createNaturalTreeSpeciesRegions } from "../../planning-data/NaturalVegetationProfile";
import { vegetationRank } from "@galacean/engine-vegetation/world/VegetationRandom";
import { hashSeed } from "@galacean/engine-terrain/rock-formation/math";
import { sampleSeedWorldHeight } from "../../runtime/SeedWorldFields.ts";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import {
  createFarShadowRenderersProxy,
  setFarShadowCascadeProxy
} from "@galacean/engine-modify/rendering/FarShadowCascadeProxy";
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
  Color,
  Matrix,
  MeshRenderer,
  Vector3,
  Vector4,
  type Material,
  type ModelMesh,
  type PBRMaterial,
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
import { loadPlantJSON } from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantResources";
import {
  loadProceduralPlantMaterialBindings,
  plantMaterialRole
} from "@galacean/engine-vegetation/asset-assembly/ProceduralPlantMaterialBindings";
import type { SeedWorldTerrainRuntime } from "../../runtime/SeedWorldTerrainRuntime.ts";
import { TerrainLodGroupRendererRuntime } from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import { SEED_WORLD_POPULATION_RUNTIME_PROFILE } from "../../runtime/SeedWorldPopulationRuntimeCell.ts";
import { resolveSeedWorldTreeTransitionHeights } from "../../world/SeedWorldRuntimeLodProfile";
import { NATURAL_VEGETATION_COMPANION_PATCHES } from "../../runtime/NaturalVegetationLayers.ts";
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
import { resolveGeneratedFlowerAssetWeights } from "../../planning-data/FlowerAssetWeights";
import type { LandscapeView, LandscapeFocus } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import type { RockFormationSettings } from "../../integrations/terrain/rock-formation/Settings";
import {
  createRockVariantMaterial,
  prepareRockLodDither
} from "../../integrations/terrain/rock-formation/RockMaterial";
import {
  acquireRockVariantMesh,
  pickRockVariant,
  prepareRockVariant,
  rockVariantFit,
  rockVariantPools
} from "../../integrations/terrain/rock-formation/Variants";
import type { RockColorBlend } from "../../integrations/terrain/rock-formation/ColorPalette.ts";
import { setRockColorBlend } from "../../integrations/terrain/rock-formation/ColorMaterial";
import { rockFormationGround } from "../../integrations/terrain/rock-formation/Placement";
import type { RockFormationJob, RockFormationMesh, V3 } from "@galacean/engine-terrain/rock-formation/types";
import {
  createSeedWorldExactInstanceLodEntry,
  SeedWorldExactInstanceCellRuntime,
  type SeedWorldExactInstanceSpatialEntry
} from "../../world/SeedWorldExactInstanceCellRuntime";

type PlantSource = ReturnType<ProceduralPlantLibraryRuntime["getPlacementSources"]>[number];
type Source = Pick<PlantSource, "bounds" | "rendererBindings"> & {
  entry: Pick<PlantSource["entry"], "id" | "category" | "instanceScale">;
  kind?: "stone";
  transitionHeights?: readonly number[];
  variantStone?: true;
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
  appearanceBindings: readonly { renderer: MeshRenderer; source: Source["rendererBindings"][number] }[];
};
type CellPlantRecord = {
  instance: LandscapePlantInstance;
  groundHeight: number;
  stagedGroundHeight?: number;
  refYOffset: number;
  worldSize: number;
  terminalCutoff: number;
  plant?: Plant;
};
type Cell = {
  root: Entity;
  plants: Plant[];
  records?: CellPlantRecord[];
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
/** Display preview owned by a published World; accepted edits persist through project transactions. */
export interface PlanningPlantAppearancePreview {
  baseColor?: readonly [number, number, number];
  shaderData?: Readonly<Record<string, number | readonly [number, number, number, number]>>;
  macros?: Readonly<Record<string, boolean>>;
}
/** Shared procedural resources plus ordinary MeshRenderers: Engine native instancing remains authoritative. */
export class PlanningNaturalVegetationRuntime {
  private readonly libraries: ProceduralPlantLibraryRuntime[] = [];
  private catalogSources?: PlantSpeciesSources;
  private materials?: Awaited<ReturnType<typeof loadProceduralPlantMaterialBindings>>;
  private sources: Map<string, Source>[] = [];
  private readonly metadataSources = new Map<
    string,
    Pick<Source, "entry" | "bounds" | "kind" | "variantStone"> & { lodCount?: number }
  >();
  private readonly loadedProceduralIds = new Set<string>();
  private terrainGrassHost?: Pick<SeedWorldTerrainRuntime, "registerGrassAppearanceMaterial">;
  private rockSettings?: RockFormationSettings;
  private rockSignal?: AbortSignal;
  private blockingPresentationDrain = false;
  private initialDrainPosition?: { x: number; z: number };
  private materializeCamX = NaN;
  private materializeCamY = NaN;
  private materializeCamZ = NaN;
  private materializeCamFov = NaN;
  private materializePendingMore = false;
  private planner!: PlanningNaturalVegetation;
  private population!: SeedWorldPopulationPreview;
  plantAssets: readonly PlanningPlantAsset[] = [];
  private readonly trees: Plant[] = [];
  private readonly treePool = new Map<string, Plant>();
  private readonly previewColors = new Map<string, readonly [number, number, number]>();
  private readonly previewSurfaces = new WeakMap<Material, PlanningPlantAppearancePreview>();
  private height!: PlanningHeightmap;
  private readonly cells = new Map<string, Cell>();
  private detailTask?: Promise<void>;
  private readonly plantLodEntries = new WeakMap<Plant, SeedWorldExactInstanceSpatialEntry>();
  private readonly lodCells: SeedWorldExactInstanceCellRuntime;
  private lodMembershipDirty = true;
  private lastLodMembershipRebuildTime = -Infinity;
  private streamX = NaN;
  private streamZ = NaN;
  private pendingCells: { key: string; x: number; z: number; distance: number }[] = [];
  private readonly groundExclusions = new Map<string, readonly PlanPoint[][]>();
  private foliageColors?: FoliageColors;
  private barkColors?: FoliageColors;
  private readonly treeRoot: Entity;
  private readonly detailRoot: Entity;
  private readonly resourceRoot: Entity;
  private rockSources?: Awaited<ReturnType<typeof createCompanionRockSources>>;
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
  private rockGround?: ReturnType<typeof rockFormationGround>;
  private preparedRockGround?: ReturnType<typeof rockFormationGround>;
  private readonly grassMaterials = new Set<Material>();
  private readonly groundCoverMaterials = new Map<Material, Map<string, Material>>();
  private readonly groundCoverBrightness: Record<string, number> = {};
  private readonly releaseGrassAppearance: Array<() => void> = [];
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
    // Renderer visibility and shadow culling still belong to the engine for these plants.
    this.lodCells = new SeedWorldExactInstanceCellRuntime(camera, [], undefined, false);
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

  private appearanceMaterials(assetId: string, materialId: string): Set<Material> {
    return new Set(
      this.sources
        .flatMap(
          (level) =>
            level
              .get(assetId)
              ?.rendererBindings.filter((binding) => binding.materialId === materialId)
              .flatMap((binding) => binding.renderer.getMaterials()) ?? []
        )
        .filter((material): material is Material => !!material)
    );
  }

  appearancePreview(assetId: string, materialId: string): PlanningPlantAppearancePreview {
    const surface = [...this.appearanceMaterials(assetId, materialId)]
      .map((material) => this.previewSurfaces.get(material))
      .find(Boolean);
    const baseColor = this.previewColors.get(JSON.stringify([assetId, materialId]));
    return structuredClone({ ...surface, ...(baseColor ? { baseColor } : {}) });
  }

  /** Synchronous uniform/instance-data updates: keep the World, meshes and placement intact. */
  previewAppearance(assetId: string, materialId: string, patch: PlanningPlantAppearancePreview): void {
    if (this.disposed) throw new Error("Vegetation is disposed");
    if (
      patch.baseColor &&
      (patch.baseColor.length !== 3 || !patch.baseColor.every((value) => Number.isFinite(value) && value >= 0))
    )
      throw new Error("Invalid vegetation preview color");
    for (const value of Object.values(patch.shaderData ?? {}))
      if (
        typeof value === "number"
          ? !Number.isFinite(value)
          : !Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite)
      )
        throw new Error("Invalid vegetation preview uniform");
    if (Object.values(patch.macros ?? {}).some((value) => typeof value !== "boolean"))
      throw new Error("Invalid vegetation preview switch");
    const materials = this.appearanceMaterials(assetId, materialId);
    if (!materials.size) throw new Error(`Vegetation material slot is unavailable: ${assetId}/${materialId}`);
    if (patch.baseColor) {
      this.previewColors.set(JSON.stringify([assetId, materialId]), [...patch.baseColor]);
      const refresh = (plant: Plant) => {
        if (plant.instance.assetId !== assetId) return;
        for (const { renderer, source } of plant.appearanceBindings)
          if (source.materialId === materialId) {
            applyPlantRendererColor(
              renderer,
              this.plantColor(plant.instance, source),
              !!source.renderer.shaderData.getVector4("renderer_ProceduralTreeLeafColor")
            );
            for (const channel of ["R", "G", "B"])
              renderer.shaderData.enableMacro(`RENDERER_PLANT_COLOR_OVERRIDE_${channel}`);
          }
      };
      for (const plant of this.treePool.values()) refresh(plant);
      for (const cell of this.cells.values()) for (const plant of cell.plants) refresh(plant);
    }
    for (const material of materials) {
      const previous = this.previewSurfaces.get(material);
      this.previewSurfaces.set(material, {
        shaderData: { ...previous?.shaderData, ...patch.shaderData },
        macros: { ...previous?.macros, ...patch.macros }
      });
      for (const [property, value] of Object.entries(patch.shaderData ?? {})) {
        if (typeof value === "number") material.shaderData.setFloat(property, value);
        else material.shaderData.setColor(property, new Color(...value));
      }
      for (const [macro, enabled] of Object.entries(patch.macros ?? {})) {
        if (enabled) material.shaderData.enableMacro(macro);
        else material.shaderData.disableMacro(macro);
      }
    }
    this.foliageColors = undefined;
    this.barkColors = undefined;
  }

  private assetBounds(assetId: string): Source["bounds"] {
    const bounds = this.sources[0]?.get(assetId)?.bounds ?? this.metadataSources?.get(assetId)?.bounds;
    if (!bounds) throw new Error(`Missing natural vegetation bounds: ${assetId}`);
    return bounds;
  }

  private buildPlantAssetsFromMetadata(): PlanningPlantAsset[] {
    return [...this.metadataSources.values()].map((source) => {
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
  }

  private collectRequiredGpuAssetIds(
    plan: IslandPlan,
    planner: PlanningNaturalVegetation,
    editablePlants: readonly LandscapePlantInstance[]
  ): { assetIds: Set<string>; needsCompanionRocks: boolean } {
    const assetIds = new Set<string>();
    for (const instance of editablePlants) assetIds.add(instance.assetId);

    const activeFlowerWeights = (plan.flowerRegions ?? [])
      .filter((region) => region.config.densityPerM2 > 0)
      .map((region) =>
        resolveGeneratedFlowerAssetWeights(
          plan.parameters.seed,
          region.ownerId ?? region.id,
          region.config.assetWeights
        )
      );

    let needsCompanionRocks = false;
    const hasTreeAnchors = planner.anchors.some((anchor) => anchor.layerId === "乔木");
    for (const layer of planner.layers) {
      if (layer.density <= 0) continue;
      if (layer.id === "树脚石块") {
        if (hasTreeAnchors) needsCompanionRocks = true;
        continue;
      }
      if (layer.id === "零星野花") {
        if (!activeFlowerWeights.length) continue;
        for (const member of layer.palette) {
          if (activeFlowerWeights.some((weights) => (weights[member.assetId] ?? member.weight) > 0))
            assetIds.add(member.assetId);
        }
        continue;
      }
      for (const member of layer.palette) {
        if (member.weight > 0) assetIds.add(member.assetId);
      }
    }
    return { assetIds, needsCompanionRocks };
  }

  private configureLibraryMaterial(slot: string, asset: { id: string; category: string }, id: string): Material {
    let material = this.materials!.materialForSlot(slot, asset as never, id);
    const role = plantMaterialRole(slot),
      range = PLANT_GROUND_COVER_VARIATIONS.get(asset.id);
    const groundCover = !!range && (role === "leaf" || role === "shrub");
    let brightness = 1;
    const terrain = this.terrainGrassHost;
    if (terrain && groundCover) {
      let variants = this.groundCoverMaterials.get(material);
      if (!variants) this.groundCoverMaterials.set(material, (variants = new Map()));
      let variant = variants.get(asset.id);
      if (!variant) {
        variant = material.clone();
        variants.set(asset.id, variant);
      }
      material = variant;
      brightness =
        range[0] + (range[1] - range[0]) * vegetationRank(this.plan.parameters.seed, `ground-cover-color:${asset.id}`);
      this.groundCoverBrightness[asset.id] = brightness;
    }
    if (terrain && (role === "grass" || groundCover) && !this.grassMaterials.has(material)) {
      this.grassMaterials.add(material);
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
      this.releaseGrassAppearance.push(terrain.registerGrassAppearanceMaterial(material, brightness));
    }
    return material;
  }

  private populateMetadataFromCatalog(liveCatalog: typeof PLANT_SPECIES_CATALOG): boolean {
    const scale = VEGETATION_AUTHORING_REFERENCE_SCALE;
    const baseById = new Map(PLANT_SPECIES.map((item) => [item.id, item]));
    let changed = false;
    const allLiveEntries = [
      ...liveCatalog.assets,
      ...liveCatalog.treeRecipes,
      ...(liveCatalog.shrubRecipes ?? [])
    ] as unknown as readonly (typeof PLANT_SPECIES)[number][];

    for (const entry of allLiveEntries) {
      const baseEntry = baseById.get(entry.id);
      const rawBounds = entry.vegetation?.sourceBoundsM ?? baseEntry?.vegetation?.sourceBoundsM;
      if (!rawBounds) continue;
      const baseScale = baseEntry?.instanceScale ?? [1, 1, 1];
      const liveScale = entry.instanceScale ?? [1, 1, 1];
      const ratio = [
        liveScale[0] / (baseScale[0] || 1),
        liveScale[1] / (baseScale[1] || 1),
        liveScale[2] / (baseScale[2] || 1)
      ] as const;
      const bounds = {
        min: [
          rawBounds.min[0] * scale * ratio[0],
          rawBounds.min[1] * scale * ratio[1],
          rawBounds.min[2] * scale * ratio[2]
        ] as [number, number, number],
        max: [
          rawBounds.max[0] * scale * ratio[0],
          rawBounds.max[1] * scale * ratio[1],
          rawBounds.max[2] * scale * ratio[2]
        ] as [number, number, number]
      };
      const lodCount =
        "lodCount" in entry && typeof entry.lodCount === "number"
          ? entry.lodCount
          : "lodCount" in (baseEntry ?? {}) && typeof (baseEntry as { lodCount?: number }).lodCount === "number"
            ? (baseEntry as { lodCount: number }).lodCount
            : 1;
      const prev = this.metadataSources.get(entry.id);
      if (!prev || boundsDiffer(prev.bounds, bounds) || prev.lodCount !== lodCount) {
        this.metadataSources.set(entry.id, { entry, bounds, lodCount });
        changed = true;
      }
    }
    return changed;
  }

  private async ensureGpuAssetsForWorld(
    plan: IslandPlan,
    planner: PlanningNaturalVegetation,
    editablePlants: readonly LandscapePlantInstance[],
    signal?: AbortSignal
  ): Promise<void> {
    const { assetIds, needsCompanionRocks } = this.collectRequiredGpuAssetIds(plan, planner, editablePlants);
    const indexUrl = plantSpeciesResourceUrl("plant-species.json", this.owner.engine);
    let metadataChanged = false;

    const pendingProcedural = new Set(
      [...assetIds].filter(
        (id) =>
          !this.loadedProceduralIds.has(id) &&
          !PLANT_SPECIES_CATALOG.treeRecipes.some((entry) => entry.id === id) &&
          !PLANT_SPECIES_CATALOG.shrubRecipes.some((entry) => entry.id === id)
      )
    );
    const proceduralTask = (async () => {
      if (pendingProcedural.size === 0) return;
      if (!this.materials) {
        this.materials = await loadProceduralPlantMaterialBindings(
          this.owner.engine,
          this.library,
          plantSpeciesResourceUrl(PLANT_SPECIES_CATALOG.materialFile, this.owner.engine),
          pendingProcedural
        );
      } else {
        await this.materials.ensureAssets(pendingProcedural);
      }

      const sourceLods = [0, 2, 3] as const;
      const levelLoads = await Promise.all(
        sourceLods.map(async (lod, level) => {
          const prevLod = level > 0 ? sourceLods[level - 1] : -1;
          const distinctIds = new Set(
            [...pendingProcedural].filter((id) => {
              const lodCount = this.metadataSources.get(id)?.lodCount ?? 1;
              return level === 0 || Math.min(lod, lodCount - 1) !== Math.min(prevLod, lodCount - 1);
            })
          );
          if (distinctIds.size === 0) return undefined;
          const plants = await ProceduralPlantLibraryRuntime.load({
            owner: this.resourceRoot,
            camera: this.camera,
            indexUrl,
            materialForSlot: (slot, asset, id) => this.configureLibraryMaterial(slot, asset, id),
            colorForSlot: this.materials!.colorForSlot,
            normalMapped: true,
            populationOnly: true,
            assetIds: distinctIds,
            lod
          });
          plants.setShadows(SEED_WORLD_POPULATION_RUNTIME_PROFILE.shadows.castShadows);
          return plants;
        })
      );
      for (let level = 0; level < sourceLods.length; level++) {
        const plants = levelLoads[level];
        if (plants) {
          this.libraries.push(plants);
          for (const source of plants.getPlacementSources(true)) {
            this.sources[level].set(source.entry.id, source);
            if (level === 0) {
              const prevMeta = this.metadataSources.get(source.entry.id);
              if (!prevMeta || boundsDiffer(prevMeta.bounds, source.bounds)) {
                this.metadataSources.set(source.entry.id, {
                  entry: source.entry,
                  bounds: source.bounds,
                  lodCount: prevMeta?.lodCount ?? 1
                });
                metadataChanged = true;
              }
            }
          }
        }
        if (level > 0) {
          for (const id of pendingProcedural) {
            if (!this.sources[level].has(id)) {
              const fallback = this.sources[level - 1].get(id);
              if (fallback) this.sources[level].set(id, fallback);
            }
          }
        }
      }
      for (const id of pendingProcedural) this.loadedProceduralIds.add(id);
    })();

    const catalogTask = (async () => {
      if (!this.catalogSources) {
        this.catalogSources = await PlantSpeciesSources.load(this.resourceRoot, [0, 2, 3], assetIds);
      } else {
        await this.catalogSources.ensureAssets(assetIds);
      }
    })();

    const effectiveSignal = signal ?? this.rockSignal ?? new AbortController().signal;
    const companionRockTask = (async () => {
      if (needsCompanionRocks && !this.rockSources && this.rockSettings) {
        this.rockSources = await createCompanionRockSources(
          this.resourceRoot,
          this.library.stonePlacements,
          plan,
          this.rockSettings,
          effectiveSignal
        );
      }
    })();

    await Promise.all([proceduralTask, catalogTask, companionRockTask]);

    for (let level = 0; level < 3; level++) {
      for (const [id, source] of this.catalogSources!.levels[level]) {
        this.sources[level].set(id, source);
        if (level === 0) {
          const prevMeta = this.metadataSources.get(id);
          if (!prevMeta || boundsDiffer(prevMeta.bounds, source.bounds)) {
            this.metadataSources.set(id, { entry: source.entry, bounds: source.bounds });
            metadataChanged = true;
          }
        }
      }
    }
    if (metadataChanged) {
      this.plantAssets = this.buildPlantAssetsFromMetadata();
    }

    const stoneSources = this.rockSources?.sources;
    if (stoneSources) {
      for (let level = 0; level < 3; level++) {
        for (const [id, source] of stoneSources) this.sources[level].set(id, source);
      }
    }
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
      settings: RockFormationSettings;
      signal: AbortSignal;
      formations?: readonly RockFormationMesh[];
      supportPlan?: IslandPlan;
    },
    materialParameters: PlantMaterialParameters = {},
    terrain?: Pick<SeedWorldTerrainRuntime, "registerGrassAppearanceMaterial">,
    presentation?: { view: LandscapeView; focus: LandscapeFocus },
    groundingFields: SeedWorldFields = fields,
    createOptions?: { deferInitialDrain?: boolean; initialDrainPosition?: { x: number; z: number } }
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
    runtime.terrainGrassHost = terrain;
    runtime.rockSettings = rocks.settings;
    runtime.rockSignal = rocks.signal;
    runtime.rockGround = rockFormationGround(rocks.supportPlan ?? plan, rocks.formations ?? []);
    runtime.sources = [new Map(), new Map(), new Map()];
    try {
      const indexUrl = plantSpeciesResourceUrl("plant-species.json", owner.engine);
      const liveCatalog = await loadPlantJSON<typeof PLANT_SPECIES_CATALOG>(owner.engine, indexUrl);
      runtime.populateMetadataFromCatalog(liveCatalog);

      if (rockVariantPools(plan) && library.stonePlacements.length > 0) {
        for (const placement of library.stonePlacements) {
          runtime.metadataSources.set(placement.id, {
            entry: { id: placement.id, category: "Rocks" },
            bounds: placement.bounds,
            kind: "stone",
            variantStone: true
          });
        }
      }

      const initialAssets = runtime.buildPlantAssetsFromMetadata();
      runtime.plantAssets = initialAssets;
      runtime.population = population;
      runtime.height = height;
      runtime.planner = new PlanningNaturalVegetation(plan, height, fields, population, initialAssets, presentation);
      let editablePlants = planningEditablePlants(plan, height, initialAssets);
      await runtime.ensureGpuAssetsForWorld(plan, runtime.planner, editablePlants, rocks.signal);
      if (runtime.plantAssets !== initialAssets) {
        runtime.planner = new PlanningNaturalVegetation(
          plan,
          height,
          fields,
          population,
          runtime.plantAssets,
          presentation
        );
        editablePlants = planningEditablePlants(plan, height, runtime.plantAssets);
      }

      // Pending placement candidates are not validated trees and need no entities.
      // Existing transaction staging creates newly revealed instances on demand.
      for (const instance of editablePlants) {
        const plant = runtime.plant(runtime.treeRoot, instance, instance.layerId === "乔木");
        runtime.trees.push(plant);
        runtime.treePool.set(instance.id, plant);
      }
      // Initial nearby cells are ready before publication; later cells retain the same deterministic identities.
      // During initial startup before the spawn camera pose is applied, callers can supply the spawn position
      // directly (overlapping with parallel worker loads) or defer draining to preparePresentation().
      if (!createOptions?.deferInitialDrain) {
        runtime.initialDrainPosition = createOptions?.initialDrainPosition;
        runtime.blockingPresentationDrain = true;
        try {
          runtime.update(0);
          while (runtime.detailTask && !runtime.error) {
            await runtime.detailTask;
            runtime.update(0);
          }
        } finally {
          runtime.blockingPresentationDrain = false;
          runtime.initialDrainPosition = undefined;
        }
      }
      if (runtime.error) throw new Error(runtime.error);
      return runtime;
    } catch (error) {
      runtime.dispose();
      throw error;
    }
  }
  setRockColorBlend(color: RockColorBlend): void {
    this.rockSources?.setColorBlend(color);
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
    const liveCatalog = await loadPlantJSON<typeof PLANT_SPECIES_CATALOG>(
      this.owner.engine,
      plantSpeciesResourceUrl("plant-species.json", this.owner.engine)
    );
    if (this.populateMetadataFromCatalog(liveCatalog)) {
      this.plantAssets = this.buildPlantAssetsFromMetadata();
    }
    let instances = planningEditablePlants(plan, this.height, this.plantAssets);
    let nextPlanner = new PlanningNaturalVegetation(
      plan,
      this.height,
      this.groundingFields,
      this.population,
      this.plantAssets,
      this.presentation
    );
    const prevAssets = this.plantAssets;
    await this.ensureGpuAssetsForWorld(plan, nextPlanner, instances, signal);
    signal?.throwIfAborted();
    if (this.plantAssets !== prevAssets) {
      instances = planningEditablePlants(plan, this.height, this.plantAssets);
      nextPlanner = new PlanningNaturalVegetation(
        plan,
        this.height,
        this.groundingFields,
        this.population,
        this.plantAssets,
        this.presentation
      );
    }
    let stagedRoot: Entity | undefined;
    const stage = () => {
      if (!stagedRoot) {
        stagedRoot = this.treeRoot.createChild("Prepared tree edit");
        stagedRoot.isActive = false;
      }
      return stagedRoot;
    };
    const created: Plant[] = [];
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
            ? this.plantGroundHeight(this.groundingFields, instance, this.sources[0].get(instance.assetId))
            : plant.groundHeight;
        transformed ||= plant.root.transform.position.y !== ground;
        // Regional colour follows the edited location through the same native
        // bindings as initial publication. Stage uniforms; retain every renderer.
        const appearance =
          JSON.stringify(before.appearance) !== JSON.stringify(instance.appearance)
            ? plant.appearanceBindings.map(({ renderer, source: binding }) => ({
                renderer,
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
        const cell = this.buildPopulatedCell(root, result);
        replacements.set(key, cell);
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
              const bounds = this.assetBounds(instance.assetId);
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
        this.lodMembershipDirty = true;
        this.streamX = NaN;
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
    const preview = this.previewColors.get(JSON.stringify([instance.assetId, binding.materialId]));
    if (preview)
      return new Vector4(
        ...(preview.map((value, axis) => value * (binding.authoredColorScale?.[axis] ?? 1)) as [
          number,
          number,
          number
        ]),
        source.w
      );
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
    return this.rockSources?.forInstance(instance, level) ?? this.sources[level].get(instance.assetId)!;
  }
  private plant(
    owner: Entity,
    instance: LandscapePlantInstance,
    tree: boolean,
    fields = this.groundingFields,
    rockSupport = this.preparedRockGround ?? this.rockGround,
    precomputedGround?: number
  ): Plant {
    const root = owner.createChild(instance.id),
      source = this.sourceForPlant(instance, 0);
    const profile = SEED_WORLD_POPULATION_RUNTIME_PROFILE;
    const shadows = tree
      ? profile.tree.shadows
      : source.entry.category === "Trees"
        ? profile.shrub.shadows
        : profile.shadows;
    const ground = precomputedGround ?? this.plantGroundHeight(fields, instance, source, rockSupport);
    const groundHeight = this.preparedGroundingFields
      ? this.plantGroundHeight(this.preparedGroundingFields, instance, source)
      : ground;
    const grassRootPositions: Vector4[] = [];
    const foliageRenderers: MeshRenderer[] = [];
    const barkRenderers: MeshRenderer[] = [];
    const appearanceBindings: Plant["appearanceBindings"][number][] = [];
    root.transform.setPosition(instance.position[0], ground, instance.position[2]);
    root.transform.setRotation(0, instance.yaw, 0);
    const uniformScale = [instance.scale, instance.scale, instance.scale] as const;
    root.transform.setScale(...(source.variantStone ? uniformScale : (instance.scaleAxes ?? uniformScale)));
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
    const size = Math.max(...b.max.map((v, axis) => v - b.min[axis]));
    const appliedScale = source.variantStone ? uniformScale : (instance.scaleAxes ?? uniformScale);
    const worldSize = size * Math.max(Math.abs(appliedScale[0]), Math.abs(appliedScale[1]), Math.abs(appliedScale[2]));
    const tanHalfFov = Math.tan(((this.camera?.fieldOfView ?? 45) * Math.PI) / 360);
    const shadowMaxDist = (this.owner?.scene?.shadowDistance ?? 150) + 30;
    const treeLevelWithinShadowDistance = (level: number) => {
      if (level === 0 || this.camera?.isOrthographic) return true;
      const enterThreshold = thresholds[level - 1] ?? 0;
      if (enterThreshold <= 0) return true;
      const enterDistance = worldSize / Math.max(1e-6, 2 * enterThreshold * tanHalfFov);
      return enterDistance <= shadowMaxDist;
    };
    const worldHeight = (b.max[1] - b.min[1]) * (instance.scaleAxes?.[1] ?? instance.scale);
    const resolveSpecimenCastShadows = (specimen: Source, level: number) =>
      source.kind === "stone"
        ? specimen.rendererBindings.every((binding) => binding.renderer.castShadows) &&
          level === 0 &&
          worldHeight >= 1.5
        : tree
          ? shadows.castShadows && treeLevelWithinShadowDistance(level)
          : shadows.castShadows && level === 0;
    const collapsedLevels: { screenRelativeTransitionHeight: number; level: number; specimen: Source }[] = [];
    for (let level = 0; level < thresholds.length; level++) {
      const specimen = this.sourceForPlant(instance, level);
      const prev = collapsedLevels[collapsedLevels.length - 1];
      if (
        prev &&
        prev.specimen === specimen &&
        resolveSpecimenCastShadows(prev.specimen, prev.level) === resolveSpecimenCastShadows(specimen, level)
      ) {
        prev.screenRelativeTransitionHeight = thresholds[level];
      } else {
        collapsedLevels.push({ screenRelativeTransitionHeight: thresholds[level], level, specimen });
      }
    }
    const pickBatches: SeedWorldArrayPickBatch[] = [];
    const pickId = resolvePlanningNaturalPlantPick(instance, tree);
    const levelRenderers: MeshRenderer[][] = [];
    const lods = collapsedLevels.map(({ screenRelativeTransitionHeight, level, specimen }) => {
      const currentLevelRenderers: MeshRenderer[] = [];
      levelRenderers.push(currentLevelRenderers);
      const renderers = specimen.rendererBindings.map((binding, index) => {
        const { renderer: original, materialId } = binding;
        const name = `LOD${level}-${index}`,
          child = root.createChild(name),
          renderer = child.addComponent(MeshRenderer);
        currentLevelRenderers.push(renderer);
        const local = new Matrix();
        Matrix.multiply(origin, original.entity.transform.worldMatrix, local);
        child.transform.localMatrix = local;
        renderer.mesh = original.mesh;
        renderer.setMaterials([...original.getMaterials()]);
        original.shaderData.cloneTo(renderer.shaderData);
        const authoredChannels = plantMaterialColorOverrideMask(this.materialParameters, instance.assetId, materialId);
        const previewColor = this.previewColors.has(JSON.stringify([instance.assetId, materialId]));
        for (const [index, channel] of ["R", "G", "B"].entries()) {
          const macro = `RENDERER_PLANT_COLOR_OVERRIDE_${channel}`;
          if (previewColor || authoredChannels[index]) renderer.shaderData.enableMacro(macro);
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
        appearanceBindings.push({ renderer, source: binding });
        const role = PLANT_SPECIES_MATERIALS[instance.assetId]?.[materialId]?.role;
        if (
          level === 0 &&
          !PLANT_GROUND_COVER_VARIATIONS.has(instance.assetId) &&
          (role === "leaf" || role === "shrub")
        )
          foliageRenderers.push(renderer);
        if (level === 0 && role === "bark") barkRenderers.push(renderer);
        renderer.enableVertexColor = original.enableVertexColor;
        renderer.castShadows =
          source.kind === "stone"
            ? original.castShadows && level === 0 && worldHeight >= 1.5
            : tree
              ? shadows.castShadows && treeLevelWithinShadowDistance(level)
              : shadows.castShadows && level === 0;
        renderer.receiveShadows = source.kind === "stone" ? original.receiveShadows : shadows.receiveShadows;
        const pick = new SeedWorldArrayPickBatch(renderer);
        pick.count = 1;
        pick.id = pickId;
        pick.interactionOccluder = !PLANT_GROUND_COVER_VARIATIONS.has(instance.assetId);
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
    if ((tree || source.kind === "stone") && levelRenderers.length > 1) {
      const lowestRenderers = levelRenderers[levelRenderers.length - 1]!;
      if (lowestRenderers.length > 0) {
        const farShadowProxy = createFarShadowRenderersProxy(lowestRenderers);
        for (const groupRenderers of levelRenderers) {
          for (const renderer of groupRenderers) setFarShadowCascadeProxy(renderer, farShadowProxy);
        }
      }
    }
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
      SEED_WORLD_POPULATION_RUNTIME_PROFILE.tree.crossFadeSeconds
    );
    lod.setAuthoringVisible(!this.groundExcluded(instance));
    return {
      root,
      lod,
      instance,
      pickBatches,
      groundHeight,
      grassRootPositions,
      foliageRenderers,
      barkRenderers,
      appearanceBindings
    };
  }

  private createCellRecord(
    instance: LandscapePlantInstance,
    fields = this.groundingFields,
    rockSupport = this.preparedRockGround ?? this.rockGround
  ): CellPlantRecord {
    const source = this.sourceForPlant(instance, 0);
    const groundHeight = this.plantGroundHeight(fields, instance, source, rockSupport);
    const b = source.bounds;
    const groundingOffset = planningNaturalPlantGroundingOffset(source, plantingHeights.get(instance.assetId));
    const uniformScale = [instance.scale, instance.scale, instance.scale] as const;
    const scaleAxes = source.variantStone ? uniformScale : (instance.scaleAxes ?? uniformScale);
    const maxScale = Math.max(Math.abs(scaleAxes[0]), Math.abs(scaleAxes[1]), Math.abs(scaleAxes[2]));
    const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    const thresholds =
      source.transitionHeights ??
      this.catalogSources?.transitionHeights.get(instance.assetId) ??
      this.library.shrub.lodGroup!.screenRelativeTransitionHeights;
    return {
      instance,
      groundHeight,
      refYOffset: ((b.max[1] - b.min[1]) / 2 + groundingOffset) * scaleAxes[1],
      worldSize: size * maxScale,
      terminalCutoff: thresholds[thresholds.length - 1] ?? 0
    };
  }

  private isRecordWithinMaterializeRange(
    record: CellPlantRecord,
    camX: number,
    camY: number,
    camZ: number,
    isOrtho: boolean,
    orthoSize: number,
    tanHalfFov: number,
    detailMaxDist: number
  ): boolean {
    const dx = record.instance.position[0] - camX;
    const dz = record.instance.position[2] - camZ;
    const horizDistSq = dx * dx + dz * dz;
    const maxHoriz = detailMaxDist + 4;
    if (horizDistSq > maxHoriz * maxHoriz) return false;
    if (record.terminalCutoff <= 0) return true;
    if (isOrtho) return record.worldSize / Math.max(1e-6, 2 * orthoSize) >= record.terminalCutoff * 0.9;
    const dy = record.groundHeight + record.refYOffset - camY;
    const maxLodDist = record.worldSize / Math.max(1e-6, 2 * record.terminalCutoff * tanHalfFov) + 4;
    return horizDistSq + dy * dy <= maxLodDist * maxLodDist;
  }

  private buildPopulatedCell(
    root: Entity,
    result: VegetationLandscapePlan,
    fields = this.groundingFields,
    rockSupport = this.preparedRockGround ?? this.rockGround
  ): Cell {
    const records = result.instances.map((instance) => this.createCellRecord(instance, fields, rockSupport));
    const plants: Plant[] = [];
    const camPos = this.camera?.entity?.transform?.worldPosition;
    if (camPos) {
      const camX = camPos.x ?? 0,
        camY = camPos.y ?? 0,
        camZ = camPos.z ?? 0;
      const isOrtho = !!this.camera.isOrthographic;
      const orthoSize = this.camera.orthographicSize ?? 10;
      const tanHalfFov = Math.tan(((this.camera.fieldOfView ?? 45) * Math.PI) / 360);
      const detailMaxDist = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.materialFade.maximumDistanceMetres;
      for (const record of records) {
        if (
          this.isRecordWithinMaterializeRange(record, camX, camY, camZ, isOrtho, orthoSize, tanHalfFov, detailMaxDist)
        ) {
          record.plant = this.plant(root, record.instance, false, fields, rockSupport, record.groundHeight);
          plants.push(record.plant);
        }
      }
    }
    return {
      root,
      plants,
      records,
      counts: result.diagnostics.layers,
      populations: result.diagnostics.populations,
      decorations: result.diagnostics.decorations,
      visibilityRejected: result.diagnostics.rejected.visibility ?? 0
    };
  }

  private materializeNearbyCellRecords(budgetMs: number): void {
    const camPos = this.camera?.entity?.transform?.worldPosition;
    if (!camPos || !this.cells?.size) return;
    const camX = camPos.x ?? 0,
      camY = camPos.y ?? 0,
      camZ = camPos.z ?? 0;
    const fovKey = this.camera.isOrthographic ? -(this.camera.orthographicSize ?? 10) : (this.camera.fieldOfView ?? 45);
    const movedSq =
      (camX - this.materializeCamX) * (camX - this.materializeCamX) +
      (camY - this.materializeCamY) * (camY - this.materializeCamY) +
      (camZ - this.materializeCamZ) * (camZ - this.materializeCamZ);
    if (!this.materializePendingMore && fovKey === this.materializeCamFov && movedSq < 0.25) return;

    this.materializeCamX = camX;
    this.materializeCamY = camY;
    this.materializeCamZ = camZ;
    this.materializeCamFov = fovKey;
    this.materializePendingMore = false;

    const isOrtho = !!this.camera.isOrthographic;
    const orthoSize = this.camera.orthographicSize ?? 10;
    const tanHalfFov = Math.tan(((this.camera.fieldOfView ?? 45) * Math.PI) / 360);
    const detailMaxDist = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.materialFade.maximumDistanceMetres;
    const deadline = Number.isFinite(budgetMs) ? performance.now() + budgetMs : Infinity;

    for (const cell of this.cells.values()) {
      if (!cell.records) continue;
      for (const record of cell.records) {
        if (record.plant) continue;
        if (
          this.isRecordWithinMaterializeRange(record, camX, camY, camZ, isOrtho, orthoSize, tanHalfFov, detailMaxDist)
        ) {
          record.plant = this.plant(
            cell.root,
            record.instance,
            false,
            this.groundingFields,
            this.preparedRockGround ?? this.rockGround,
            record.groundHeight
          );
          cell.plants.push(record.plant);
          this.lodMembershipDirty = true;
          if (performance.now() >= deadline) {
            this.materializePendingMore = true;
            return;
          }
        }
      }
    }
  }

  private groundExcluded(instance: LandscapePlantInstance): boolean {
    const b = this.assetBounds(instance.assetId);
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
        b = this.assetBounds(instance.assetId);
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
    this.lodCells?.invalidate();
    if (this.error) throw new Error(this.error);
  }
  /** Finish the existing nearby-cell demand before collecting its actual LOD renderers. */
  async preparePresentation(): Promise<void> {
    this.blockingPresentationDrain = true;
    try {
      this.update(0);
      while (this.detailTask) {
        await this.detailTask;
        if (this.disposed) return;
        this.update(0);
      }
    } finally {
      this.blockingPresentationDrain = false;
    }
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.time += dt;
    if (!this.error) {
      this.updateDetailStreaming();
      this.materializeNearbyCellRecords(this.blockingPresentationDrain ? Infinity : 2.0);
    }
    if (
      this.lodMembershipDirty &&
      (this.blockingPresentationDrain ||
        !this.materializePendingMore ||
        this.time - this.lastLodMembershipRebuildTime >= 0.25)
    ) {
      const entries = this.trees.map((tree) => this.plantLodEntry(tree, false));
      for (const cell of this.cells.values())
        for (const plant of cell.plants) entries.push(this.plantLodEntry(plant, true));
      this.lodCells?.replaceEntries(entries);
      this.lodMembershipDirty = false;
      this.lastLodMembershipRebuildTime = this.time;
    }
    this.lodCells?.update(this.time);
  }

  private plantLodEntry(plant: Plant, detail: boolean): SeedWorldExactInstanceSpatialEntry {
    let entry = this.plantLodEntries.get(plant);
    if (!entry) {
      const distance = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.materialFade.maximumDistanceMetres;
      entry = createSeedWorldExactInstanceLodEntry(
        plant.instance.id,
        plant.instance.layerId,
        plant.root,
        plant.lod,
        detail
          ? {
              camera: this.camera,
              x: plant.instance.position[0],
              z: plant.instance.position[2],
              maxDistance: distance
            }
          : undefined
      );
      this.plantLodEntries.set(plant, entry);
    }
    return entry;
  }

  private updateDetailStreaming(): void {
    this.pendingCells ??= [];
    const position = this.initialDrainPosition ?? this.camera.entity.transform.worldPosition;
    const dx = position.x - this.streamX;
    const dz = position.z - this.streamZ;
    if (Number.isNaN(this.streamX) || dx * dx + dz * dz >= 1.0) {
      this.streamX = position.x;
      this.streamZ = position.z;
      this.refreshDetailResidency(position);
    }
    if (this.detailTask) return;
    let item = this.pendingCells.shift();
    while (item && this.cells.has(item.key)) item = this.pendingCells.shift();
    if (item) {
      const { key, x, z } = item;
      const streamX = this.streamX,
        streamZ = this.streamZ;
      const planner = this.planner,
        rocks = this.rockSources;
      const isPresentationDrain = !!this.blockingPresentationDrain;
      const sliceBudgetMs = isPresentationDrain ? 24 : 2;
      const yieldSlice = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
      const load = async () => {
        let result: VegetationLandscapePlan;
        if (typeof planner.compileCellSteps === "function") {
          const steps = planner.compileCellSteps(x, z);
          let sliceStartedAt = performance.now();
          for (;;) {
            const next = steps.next();
            if (next.done) {
              result = next.value;
              break;
            }
            if (performance.now() - sliceStartedAt >= sliceBudgetMs) {
              await yieldSlice();
              if (this.disposed || this.planner !== planner || this.rockSources !== rocks) return;
              sliceStartedAt = performance.now();
            }
          }
        } else {
          result = planner.compileCell(x, z);
        }
        const rockPrep = (
          rocks as { prepareInstances?: (instances: readonly LandscapePlantInstance[]) => Promise<void> } | undefined
        )?.prepareInstances?.(result.instances);
        if (rockPrep) {
          await rockPrep;
        } else {
          await yieldSlice();
        }
        if (this.disposed || this.planner !== planner || this.rockSources !== rocks) return;
        const root = this.detailRoot.createChild(`Natural cell ${key}`);
        try {
          const records = result.instances.map((instance) => this.createCellRecord(instance));
          const plants: Plant[] = [];
          const camPos = this.camera?.entity?.transform?.worldPosition;
          if (camPos && records.length > 0) {
            const camX = camPos.x ?? 0,
              camY = camPos.y ?? 0,
              camZ = camPos.z ?? 0;
            const isOrtho = !!this.camera.isOrthographic;
            const orthoSize = this.camera.orthographicSize ?? 10;
            const tanHalfFov = Math.tan(((this.camera.fieldOfView ?? 45) * Math.PI) / 360);
            const detailMaxDist = SEED_WORLD_POPULATION_RUNTIME_PROFILE.detail.materialFade.maximumDistanceMetres;
            let sliceStartedAt = performance.now();
            for (const record of records) {
              if (
                this.isRecordWithinMaterializeRange(
                  record,
                  camX,
                  camY,
                  camZ,
                  isOrtho,
                  orthoSize,
                  tanHalfFov,
                  detailMaxDist
                )
              ) {
                record.plant = this.plant(
                  root,
                  record.instance,
                  false,
                  this.groundingFields,
                  this.preparedRockGround ?? this.rockGround,
                  record.groundHeight
                );
                plants.push(record.plant);
                if (performance.now() - sliceStartedAt >= sliceBudgetMs) {
                  await yieldSlice();
                  if (this.disposed || this.planner !== planner || this.rockSources !== rocks) {
                    destroyTree(root);
                    return;
                  }
                  sliceStartedAt = performance.now();
                }
              }
            }
          }
          this.cells.set(key, {
            root,
            plants,
            records,
            counts: result.diagnostics.layers,
            populations: result.diagnostics.populations,
            decorations: result.diagnostics.decorations,
            visibilityRejected: result.diagnostics.rejected.visibility ?? 0
          });
          this.foliageColors = undefined;
          this.lodMembershipDirty = true;
          this.materializeCamX = NaN;
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
          if (
            this.planner !== planner ||
            this.rockSources !== rocks ||
            this.streamX !== streamX ||
            this.streamZ !== streamZ
          )
            this.streamX = NaN;
        });
    }
  }

  private refreshDetailResidency(position: { readonly x: number; readonly z: number }): void {
    const profile = SEED_WORLD_POPULATION_RUNTIME_PROFILE,
      cellSize = profile.cellMetres;
    const distance = profile.detail.materialFade.maximumDistanceMetres;
    const distanceSq = distance * distance;
    const retainSq = profile.detail.prefetchDistanceMetres * profile.detail.prefetchDistanceMetres;
    const px = position.x,
      pz = position.z;
    const minX = Math.max(0, Math.floor((px - distance) / cellSize));
    const maxX = Math.min(Math.ceil(this.plan.parameters.width / cellSize) - 1, Math.floor((px + distance) / cellSize));
    const minZ = Math.max(0, Math.floor((pz - distance) / cellSize));
    const maxZ = Math.min(Math.ceil(this.plan.parameters.depth / cellSize) - 1, Math.floor((pz + distance) / cellSize));
    const pending: { key: string; x: number; z: number; distance: number }[] = [];
    for (let z = minZ; z <= maxZ; z++) {
      const zMin = z * cellSize;
      const dz = zMin > pz ? zMin - pz : pz > zMin + cellSize ? pz - (zMin + cellSize) : 0;
      const dzSq = dz * dz;
      for (let x = minX; x <= maxX; x++) {
        const xMin = x * cellSize;
        const dx = xMin > px ? xMin - px : px > xMin + cellSize ? px - (xMin + cellSize) : 0;
        const dSq = dx * dx + dzSq;
        if (dSq <= distanceSq) {
          const key = `${x}/${z}`;
          if (!this.cells.has(key)) pending.push({ key, x, z, distance: dSq });
        }
      }
    }
    if (pending.length > 1) pending.sort((a, b) => a.distance - b.distance);
    for (const [key, cell] of this.cells) {
      const slash = key.indexOf("/");
      const x = Number(key.slice(0, slash));
      const z = Number(key.slice(slash + 1));
      const xMin = x * cellSize;
      const zMin = z * cellSize;
      const dx = xMin > px ? xMin - px : px > xMin + cellSize ? px - (xMin + cellSize) : 0;
      const dz = zMin > pz ? zMin - pz : pz > zMin + cellSize ? pz - (zMin + cellSize) : 0;
      if (dx * dx + dz * dz > retainSq) {
        destroyTree(cell.root);
        this.cells.delete(key);
        this.lodMembershipDirty = true;
        this.foliageColors = undefined;
      }
    }
    this.pendingCells = pending;
  }

  /** Detached replacements for changed woody plants and affected resident/visible understory cells. */
  async prepareWaterImpact(
    plan: IslandPlan,
    height: PlanningHeightmap,
    fields: SeedWorldFields,
    population: SeedWorldPopulationPreview,
    bounds: SeedWorldAuthoringRuntimeBoundsV1,
    signal: AbortSignal,
    rocks?: { plan: IslandPlan; formations: readonly RockFormationMesh[] }
  ): Promise<PreparedTerrainUpdate> {
    if (this.disposed) throw Error("Vegetation is disposed");
    signal.throwIfAborted();
    const previous = {
      plan: this.plan,
      rockGround: this.rockGround,
      height: this.height,
      fields: this.groundingFields,
      population: this.population,
      planner: this.planner,
      trees: [...this.trees],
      pool: new Map(this.treePool),
      cells: new Map(this.cells)
    };
    const rockSupport = rocks ? rockFormationGround(rocks.plan, rocks.formations) : this.rockGround;
    const liveCatalog = await loadPlantJSON<typeof PLANT_SPECIES_CATALOG>(
      this.owner.engine,
      plantSpeciesResourceUrl("plant-species.json", this.owner.engine)
    );
    if (this.populateMetadataFromCatalog(liveCatalog)) {
      this.plantAssets = this.buildPlantAssetsFromMetadata();
    }
    let nextPlanner = new PlanningNaturalVegetation(
      plan,
      height,
      fields,
      population,
      this.plantAssets,
      this.presentation
    );
    let desired = planningEditablePlants(plan, height, this.plantAssets);
    const prevAssets = this.plantAssets;
    await this.ensureGpuAssetsForWorld(plan, nextPlanner, desired, signal);
    signal.throwIfAborted();
    if (this.plantAssets !== prevAssets) {
      nextPlanner = new PlanningNaturalVegetation(
        plan,
        height,
        fields,
        population,
        this.plantAssets,
        this.presentation
      );
      desired = planningEditablePlants(plan, height, this.plantAssets);
    }
    nextPlanner.setGroundExclusions([...this.groundExclusions.values()].flat());
    const stage = this.owner.createChild("Prepared water vegetation");
    stage.isActive = false;
    const inside = (x: number, z: number, margin = 0) =>
      x >= bounds.minimumX - margin &&
      x <= bounds.maximumX + margin &&
      z >= bounds.minimumZ - margin &&
      z <= bounds.maximumZ + margin;
    const nextTrees: Plant[] = [],
      created: Plant[] = [];
    const replacements = new Map<string, Cell>();
    const cellSize = SEED_WORLD_POPULATION_RUNTIME_PROFILE.cellMetres;
    try {
      for (const instance of desired) {
        const old = this.treePool.get(instance.id),
          source = this.sources[0].get(instance.assetId);
        const ground = this.plantGroundHeight(fields, instance, source, rockSupport);
        if (old && JSON.stringify(old.instance) === JSON.stringify(instance) && old.groundHeight === ground)
          nextTrees.push(old);
        else {
          const plant = this.plant(stage, instance, instance.layerId === "乔木", fields, rockSupport);
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
        replacements.set(key, this.buildPopulatedCell(root, result, fields, rockSupport));
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
      this.lodMembershipDirty = true;
      this.streamX = NaN;
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
      this.rockGround = previous.rockGround;
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
          this.rockGround = rockSupport;
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
  private plantGroundHeight(
    fields: SeedWorldFields,
    instance: LandscapePlantInstance,
    source?: Source,
    rockSupport = this.preparedRockGround ?? this.rockGround
  ): number {
    const placement = this.rockSources?.sources.get(instance.assetId) ?? source;
    return naturalPlantGroundHeight(fields, instance, placement, rockSupport);
  }

  prepareGrounding(
    fields: SeedWorldFields,
    signal?: AbortSignal,
    rocks?: { plan: IslandPlan; formations: readonly RockFormationMesh[] }
  ): { commit(): void; discard(): void } {
    if (this.disposed) throw new Error("Native vegetation is disposed");
    if (this.preparedGroundingFields) throw new Error("Native vegetation grounding is already prepared");
    signal?.throwIfAborted();
    this.preparedGroundingFields = fields;
    const rockGround = rocks ? rockFormationGround(rocks.plan, rocks.formations) : this.rockGround;
    this.preparedRockGround = rockGround;
    try {
      for (const tree of this.trees)
        tree.groundHeight = this.plantGroundHeight(fields, tree.instance, this.sources[0].get(tree.instance.assetId));
      for (const cell of this.cells.values()) {
        if (cell.records) {
          for (const record of cell.records) {
            const h = this.plantGroundHeight(fields, record.instance, this.sources[0].get(record.instance.assetId));
            record.stagedGroundHeight = h;
            if (record.plant) record.plant.groundHeight = h;
          }
        } else {
          for (const plant of cell.plants)
            plant.groundHeight = this.plantGroundHeight(
              fields,
              plant.instance,
              this.sources[0].get(plant.instance.assetId)
            );
        }
      }
    } catch (error) {
      this.preparedGroundingFields = undefined;
      this.preparedRockGround = undefined;
      throw error;
    }
    let consumed = false;
    return {
      commit: () => {
        if (consumed) throw new Error("Native vegetation grounding already consumed");
        if (this.disposed) throw new Error("Native vegetation is disposed");
        signal?.throwIfAborted();
        for (const tree of this.trees) commitPlantGrounding(tree);
        for (const cell of this.cells.values()) {
          if (cell.records) {
            for (const record of cell.records) {
              if (record.stagedGroundHeight !== undefined) {
                record.groundHeight = record.stagedGroundHeight;
                record.stagedGroundHeight = undefined;
              }
            }
          }
          for (const plant of cell.plants) commitPlantGrounding(plant);
        }
        this.lodMembershipDirty = true;
        this.materializeCamX = NaN;
        this.groundingFields = fields;
        this.rockGround = rockGround;
        this.preparedGroundingFields = undefined;
        this.preparedRockGround = undefined;
        consumed = true;
      },
      discard: () => {
        if (consumed) return;
        for (const cell of this.cells.values()) {
          if (cell.records) for (const record of cell.records) record.stagedGroundHeight = undefined;
        }
        this.preparedGroundingFields = undefined;
        this.preparedRockGround = undefined;
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
    const accumulateColor = (instance: LandscapePlantInstance, role: "foliage" | "bark", colorValues: Vector4[]) => {
      if (!colorValues.length) return;
      const gain = instance.appearance?.[role]?.brightness ?? 1;
      const colors = role === "foliage" ? foliageColors : barkColors;
      const entry = (colors[instance.assetId] ??= {
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
      for (const color of colorValues) {
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
    const recordPlantColors = (plant: Plant, role: "foliage" | "bark") => {
      const renderers = role === "foliage" ? plant.foliageRenderers : plant.barkRenderers;
      if (!renderers.length) return;
      accumulateColor(
        plant.instance,
        role,
        renderers.map(
          (renderer) =>
            (role === "foliage" ? renderer.shaderData.getVector4("renderer_ProceduralTreeLeafColor") : undefined) ??
            renderer.shaderData.getVector4("renderer_AssetAssemblyColor")
        )
      );
    };
    const recordInstanceColors = (instance: LandscapePlantInstance, role: "foliage" | "bark") => {
      if (role === "foliage" && PLANT_GROUND_COVER_VARIATIONS.has(instance.assetId)) return;
      const specimen = this.sourceForPlant(instance, 0);
      if (!specimen) return;
      const matched = specimen.rendererBindings.filter((binding) => {
        const matRole = PLANT_SPECIES_MATERIALS[instance.assetId]?.[binding.materialId]?.role;
        return role === "foliage" ? matRole === "leaf" || matRole === "shrub" : matRole === "bark";
      });
      if (!matched.length) return;
      accumulateColor(
        instance,
        role,
        matched.map((binding) => this.plantColor(instance, binding))
      );
    };
    if (!this.foliageColors) {
      for (const tree of this.trees) {
        recordPlantColors(tree, "foliage");
        recordPlantColors(tree, "bark");
      }
      for (const cell of this.cells.values()) {
        if (cell.records) {
          for (const rec of cell.records) {
            if (rec.plant) {
              recordPlantColors(rec.plant, "foliage");
              recordPlantColors(rec.plant, "bark");
            } else {
              recordInstanceColors(rec.instance, "foliage");
              recordInstanceColors(rec.instance, "bark");
            }
          }
        } else {
          for (const plant of cell.plants) {
            recordPlantColors(plant, "foliage");
            recordPlantColors(plant, "bark");
          }
        }
      }
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
    const recordDiagnosticsItem = (instance: LandscapePlantInstance, plant?: Plant) => {
      const rockSpec = this.rockSources?.forInstance(instance);
      if (rockSpec) {
        companionRocks.count++;
        if (plant) {
          for (const { renderer } of plant.pickBatches) {
            const triangles = renderer.mesh?.subMeshes.reduce((sum, mesh) => sum + mesh.count / 3, 0) ?? 0;
            companionRocks.residentTriangles += triangles;
            if (renderer.enabled && renderer.entity.isActiveInHierarchy) companionRocks.activeTriangles += triangles;
          }
        } else {
          for (const binding of rockSpec.rendererBindings) {
            const triangles = binding.renderer.mesh?.subMeshes.reduce((sum, mesh) => sum + mesh.count / 3, 0) ?? 0;
            companionRocks.residentTriangles += triangles;
          }
        }
      }
      if (instance.companionAnchorId) {
        const counts = (companionGroups[instance.companionAnchorId] ??= {});
        counts[instance.layerId] = (counts[instance.layerId] ?? 0) + 1;
      }
      if (instance.layerId === "零星野花") flowerAssets[instance.assetId] = (flowerAssets[instance.assetId] ?? 0) + 1;
      const scale = plant
          ? plant.root.transform.scale.y
          : rockSpec
            ? instance.scale
            : (instance.scaleAxes?.[1] ?? instance.scale),
        bounds = this.assetBounds(instance.assetId);
      const height = (bounds.max[1] - bounds.min[1]) * scale;
      const size = (speciesSizes[instance.assetId] ??= {
        count: 0,
        scaleY: [scale, scale],
        heightM: [height, height]
      });
      size.count++;
      size.scaleY[0] = Math.min(size.scaleY[0], scale);
      size.scaleY[1] = Math.max(size.scaleY[1], scale);
      size.heightM[0] = Math.min(size.heightM[0], height);
      size.heightM[1] = Math.max(size.heightM[1], height);
    };
    for (const cell of this.cells.values()) {
      if (cell.records) {
        for (const rec of cell.records) recordDiagnosticsItem(rec.instance, rec.plant);
      } else {
        for (const plant of cell.plants) recordDiagnosticsItem(plant.instance, plant);
      }
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
    if (this.pendingCells) this.pendingCells.length = 0;
    this.lodCells?.replaceEntries([]);
    this.groundExclusions.clear();
    this.metadataSources.clear();
    this.loadedProceduralIds.clear();
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
function naturalPlantGroundHeight(
  fields: SeedWorldFields,
  instance: LandscapePlantInstance,
  source?: Source,
  rockGround?: ReturnType<typeof rockFormationGround>
): number {
  const sample = (x: number, z: number) => {
    const terrain = sampleSeedWorldHeight(fields, x, z);
    return terrain === undefined ? undefined : (rockGround?.(x, z, terrain) ?? terrain);
  };
  let height = sample(instance.position[0], instance.position[2]) ?? instance.position[1];
  if (source?.kind === "stone" && !source.variantStone) {
    const scale = instance.scaleAxes ?? [instance.scale, instance.scale, instance.scale];
    const halfX = ((source.bounds.max[0] - source.bounds.min[0]) * scale[0]) / 2;
    const halfZ = ((source.bounds.max[2] - source.bounds.min[2]) * scale[2]) / 2;
    const yaw = (instance.yaw * Math.PI) / 180,
      cos = Math.cos(yaw),
      sin = Math.sin(yaw);
    // Ground the actual rotated footprint at its lowest corner, matching published solids.
    for (const x of [-halfX, halfX])
      for (const z of [-halfZ, halfZ]) {
        const y = sample(instance.position[0] + x * cos + z * sin, instance.position[2] - x * sin + z * cos);
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
function boundsDiffer(a: Source["bounds"], b: Source["bounds"]): boolean {
  return (
    Math.abs(a.min[0] - b.min[0]) > 1e-4 ||
    Math.abs(a.min[1] - b.min[1]) > 1e-4 ||
    Math.abs(a.min[2] - b.min[2]) > 1e-4 ||
    Math.abs(a.max[0] - b.max[0]) > 1e-4 ||
    Math.abs(a.max[1] - b.max[1]) > 1e-4 ||
    Math.abs(a.max[2] - b.max[2]) > 1e-4
  );
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

/** Pre-fit each selected stone to the authored placement envelope once for all cells. */
async function createCompanionRockSources(
  parent: Entity,
  placements: readonly AtomicAssemblyPlacement[],
  plan: IslandPlan,
  settings: RockFormationSettings,
  signal: AbortSignal
) {
  const pools = rockVariantPools(plan);
  if (!pools || !placements.length) return undefined;
  const seed = plan.parameters.seed;
  const [assets] = await Promise.all([
    Promise.all(
      pools.stones.map(async (entry) => {
        const asset = await prepareRockVariant(parent.engine, entry);
        await prepareRockLodMeshes(parent.engine, asset);
        return asset;
      })
    ),
    prepareRockLodDither(parent.engine)
  ]);
  signal.throwIfAborted();
  const root = parent.createChild("Companion rock sources");
  root.isActive = false;
  const materials: PBRMaterial[] = [];
  const releases: (() => void)[] = [];
  const sources = new Map<string, Source>();
  const variants = new Map<string, Source[][]>();
  const dispose = () => {
    root.destroy();
    for (const material of materials) material.destroy(true);
    for (const release of releases) release();
  };
  try {
    const meshes = assets.map((asset) => {
      materials.push(createRockVariantMaterial(parent.engine, asset, settings.colorBlend));
      const lease = acquireRockVariantMesh(parent.engine, asset);
      releases.push(lease.release);
      const [middle, far] = rockLodMeshes(asset) ?? [];
      return [lease.mesh, middle, far].filter((mesh) => mesh !== undefined);
    });
    for (const placement of placements) {
      const { id, bounds } = placement;
      const entry = { id, category: "Rocks" as const };
      const { min, max } = bounds;
      const size: V3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      const job: RockFormationJob = {
        id,
        seed: hashSeed(seed, id),
        origin: [(min[0] + max[0]) / 2, 0, (min[2] + max[2]) / 2],
        guides: [
          {
            id,
            ownerId: id,
            center: [0, size[1] / 2, 0],
            size,
            axes: [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1]
            ]
          }
        ]
      };
      const source = {
        entry,
        bounds,
        kind: "stone" as const,
        variantStone: true as const
      };
      sources.set(id, { ...source, rendererBindings: [] });
      variants.set(
        id,
        assets.map((asset, index) => {
          const fit = rockVariantFit(job, asset);
          const matrix = new Matrix();
          matrix.elements.set(fit);
          matrix.elements[12] += job.origin[0];
          matrix.elements[14] += job.origin[2];
          const levels = meshes[index];
          const cutoff = placement.cullScreenHeight / SEED_WORLD_SURFACE_DETAIL_TERMINAL_DISTANCE_MULTIPLIER;
          const thresholds =
            levels.length === 1 ? [cutoff] : rockLodScreenHeights([1, 0.5, cutoff].slice(3 - levels.length));
          return levels.map((mesh) => {
            const entity = root.createChild(asset.id);
            entity.transform.localMatrix = matrix;
            const renderer = entity.addComponent(MeshRenderer);
            renderer.mesh = mesh;
            renderer.setMaterial(materials[index]);
            renderer.shaderData.setVector4("renderer_AssetAssemblyColor", new Vector4(1, 1, 1, 1));
            return {
              ...source,
              transitionHeights: thresholds,
              rendererBindings: [{ renderer, materialId: "surface" }]
            };
          });
        })
      );
    }
    return {
      root,
      sources,
      specimenCount: assets.length,
      forInstance(instance: Pick<LandscapePlantInstance, "id" | "assetId">, level = 0) {
        return pickRockVariant(variants.get(instance.assetId) ?? [], hashSeed(seed, instance.id))?.[level];
      },
      setColorBlend(value: RockColorBlend) {
        for (const material of materials) setRockColorBlend(material, value);
      },
      dispose
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
