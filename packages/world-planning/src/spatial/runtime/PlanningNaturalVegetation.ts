import { yieldSeedWorldPreparationTask } from "../../world/SeedWorldPreparationTask";
import { vegetationCoverage } from "../ecology/VegetationCoverage";
import { FLOWER_DEFAULTS } from "../ecology/FlowerRegions";
import {
  createNaturalTreeSpeciesRegions,
  naturalTreeDimensions,
  naturalVegetationAt,
  publishNaturalVegetation,
  NATURAL_VEGETATION_CONTROLS,
  NATURAL_VEGETATION_DEFAULTS,
  NATURAL_VEGETATION_EDGE_LAYERS
} from "../../planning-data/NaturalVegetationProfile";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";
import {
  createLandscapeRingQuery,
  type LandscapeRingQuery
} from "@galacean/engine-vegetation/world/LandscapeRingQuery";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { hashCanonicalKey, type PlanningHeightmap } from "../../semantic-study/PlanningHeightmap";
import type { SeedWorldFields } from "../../runtime/SeedWorldFields.ts";
import type { SeedWorldPopulationPreview } from "../../runtime/SeedWorldPopulationPlan.ts";
import {
  naturalVegetationSamplingBudget,
  createNaturalVegetationLayers,
  createNaturalCompanionStoneLayer,
  NATURAL_VEGETATION_PALETTES,
  NATURAL_VEGETATION_COMPANION_PATCHES,
  SEED_WORLD_NATURAL_VEGETATION_EXCLUDED_ASSET_IDS,
  type NaturalVegetationLayerRule
} from "../../runtime/NaturalVegetationLayers.ts";
import {
  compileNaturalVegetationCell,
  compileNaturalVegetationCellSteps
} from "../../runtime/NaturalVegetationCell.ts";
import {
  type LandscapeBounds,
  type LandscapePlantAsset,
  type LandscapePlantInstance,
  type LandscapePoint
} from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import type { subjectViewLandscape } from "../PlanningSubjectView";
import { SEED_WORLD_POPULATION_CELL_METRES } from "../../runtime/SeedWorldPopulationPlan.ts";
import { flowerAssetMembers, resolveGeneratedFlowerAssetWeights } from "../../planning-data/FlowerAssetWeights";
import {
  PLANT_TREE_SPECIES,
  PLANT_FOLIAGE_VARIATIONS,
  PLANT_BARK_VARIATIONS
} from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import { vegetationColorVariation } from "@galacean/engine-vegetation/world/VegetationColorVariation";
import {
  companionAnchorReach,
  type VegetationCompanionAnchor
} from "@galacean/engine-vegetation/world/VegetationCompanionPatches";
import { planningRemovedObjectIds } from "../PlanningResources";
import { compileAuthoredVegetation } from "../ecology/AuthoredVegetation";
import {
  getSeedWorldAssetPlacementProfile,
  resolveSeedWorldAssetPlacement
} from "../../world/SeedWorldAssetPlacementProfile";
import { envelope } from "../../semantic-study/IslandPlanAtoms";
import { applyLandscapeEdits } from "../layout/DerivedEdits";
import { WORLD_TEMPLATE_ART } from "../WorldTemplateArtDirection";
import { worldTemplate } from "../WorldTemplateCatalog";

export interface PlanningPlantAsset extends LandscapePlantAsset {
  readonly bounds: LandscapeBounds;
  readonly kind?: "stone";
}
const point = (p: PlanPoint): LandscapePoint => [p.x, p.z];
type PlantingFootprint = {
  id: string;
  outline: readonly PlanPoint[];
  outer: readonly LandscapePoint[];
  holes?: readonly (readonly LandscapePoint[])[];
  bounds: readonly [number, number, number, number];
};
type PlantingRoad = PlantingFootprint & { query?: LandscapeRingQuery };
function plantingFootprint(
  id: string,
  outline: readonly PlanPoint[],
  holes?: readonly (readonly PlanPoint[])[]
): PlantingFootprint {
  return {
    id,
    outline,
    outer: outline.map(point),
    ...(holes?.length ? { holes: holes.map((hole) => hole.map(point)) } : {}),
    bounds: [
      Math.min(...outline.map((p) => p.x)),
      Math.max(...outline.map((p) => p.x)),
      Math.min(...outline.map((p) => p.z)),
      Math.max(...outline.map((p) => p.z))
    ]
  };
}
/** Consume species and proportional envelopes published by ecology. Authored OBBs remain conservative bounds. */
export function planningNaturalTrees(
  plan: Omit<IslandPlan, "landscapes"> & {
    landscapes?: readonly import("../../semantic-study/ContextLandscape").LandscapeCandidate[];
  },
  height: Pick<PlanningHeightmap, "sample">,
  assets: readonly PlanningPlantAsset[],
  excludedAssetIds: ReadonlySet<string> = SEED_WORLD_NATURAL_VEGETATION_EXCLUDED_ASSET_IDS
): LandscapePlantInstance[] {
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []);
  const candidates = (plan.landscapes ?? []).filter(
    (p) => p.kind === "tree" && p.assetRenderMode !== "prefab" && !removed.has(p.id)
  );
  if (!candidates.length) return [];
  const speciesAt = createNaturalTreeSpeciesRegions(plan.parameters.seed);
  const palette = NATURAL_VEGETATION_PALETTES.trees.map((id) => {
    const asset = assets.find((asset) => asset.id === id);
    if (!asset) throw new Error(`Missing planned tree asset: ${id}`);
    return asset;
  });
  const allowedTrees = palette.filter((asset) => !excludedAssetIds.has(asset.id));
  const activeTrees = allowedTrees.length > 0 ? allowedTrees : palette;
  const templateTreePalette = WORLD_TEMPLATE_ART[plan.parameters.worldTemplate?.id ?? ""]?.treeColorPalette;
  return candidates.map((tree) => {
    const hashParts = hashCanonicalKey(`${plan.parameters.seed}:tree:${tree.id}`).split(":");
    const hashVal = Number.parseInt(hashParts[1] ?? "0", 36);
    const stableInt = Number.isFinite(hashVal) ? Math.abs(hashVal) : 0;
    let assetId = templateTreePalette?.length
      ? activeTrees[stableInt % activeTrees.length]!.id
      : (tree.assetId ?? naturalTreeDimensions(plan.parameters.seed, tree.id, tree.height, tree.center).assetId);
    if (excludedAssetIds.has(assetId)) {
      assetId = activeTrees[stableInt % activeTrees.length]!.id;
    }
    const asset = palette.find((asset) => asset.id === assetId);
    if (!asset) throw new Error(`Missing planned tree asset: ${assetId}`);
    const spans = asset.bounds.max.map((v, axis) => v - asset.bounds.min[axis]);
    const dimensions = [tree.width, tree.height, tree.depth];
    if (![...spans, ...dimensions].every((v) => Number.isFinite(v) && v > 0))
      throw new Error(`Invalid planned tree dimensions: ${tree.id}`);
    const spread = tree.treeHorizontalScale ?? 1;
    const scale = Math.min(tree.width / spans[0] / spread, tree.height / spans[1], tree.depth / spans[2] / spread);
    const species = PLANT_TREE_SPECIES.find((species) => species.assetId === assetId)!;
    const region = speciesAt([tree.center.x, tree.center.z], tree.id);
    const baseFoliage = vegetationColorVariation(
      plan.parameters.seed,
      species.speciesGroup,
      tree.id,
      region,
      PLANT_FOLIAGE_VARIATIONS.get(assetId)!,
      "foliage"
    );
    const foliage = templateTreePalette?.length
      ? {
          brightness: 0.88 + ((stableInt % 97) / 96) * 0.28,
          tint: {
            color: templateTreePalette[Math.floor(stableInt / 7) % templateTreePalette.length]!,
            influence: 0.88
          }
        }
      : baseFoliage;
    return {
      id: tree.id,
      assetId: asset.id,
      layerId: "乔木",
      clusterId: tree.id,
      appearance: {
        foliage,
        ...(PLANT_BARK_VARIATIONS.has(assetId)
          ? {
              bark: vegetationColorVariation(
                plan.parameters.seed,
                species.speciesGroup,
                tree.id,
                region,
                PLANT_BARK_VARIATIONS.get(assetId)!,
                "bark"
              )
            }
          : {})
      },
      position: [tree.center.x, height.sample(tree.center), tree.center.z],
      yaw: (tree.yaw * 180) / Math.PI,
      scale,
      ...(spread !== 1 ? { scaleAxes: [scale * spread, scale, scale * spread] as const } : {}),
      height: spans[1] * scale,
      radius: (Math.hypot(spans[0], spans[2]) * scale * spread) / 2,
      ...(asset.groundingOffset !== undefined ? { groundingOffset: asset.groundingOffset * scale } : {})
    };
  });
}

/** Visible generated trees and authored woody plants (single, cluster, and area) share the native
 * asset pool. Their projection does not participate in ecological constraints. */
export function planningEditablePlants(
  plan: IslandPlan,
  ground: Pick<PlanningHeightmap, "sample">,
  assets: readonly PlanningPlantAsset[],
  population?: Pick<SeedWorldPopulationPreview, "treeInstances">,
  excludedAssetIds: ReadonlySet<string> = SEED_WORLD_NATURAL_VEGETATION_EXCLUDED_ASSET_IDS
): LandscapePlantInstance[] {
  const generated = planningNaturalTrees(plan, ground, assets, excludedAssetIds);
  const allResources = plan.authoredResources ?? [];
  const removed = planningRemovedObjectIds(allResources);
  const singleResources = allResources.filter(
    (resource) =>
      resource.resourceType === "object-removal" ||
      (resource.resourceType === "vegetation-brush" && resource.properties.distributionKind === "single")
  );
  const areaBrushResources = allResources.filter(
    (resource) =>
      resource.resourceType === "vegetation-brush" &&
      resource.properties.distributionKind !== "single" &&
      (resource.properties.category === "tree" || resource.properties.category === "shrub")
  );
  const areaBrushIds = new Set(areaBrushResources.map((resource) => resource.resourceId));
  const authoredSingle = compileAuthoredVegetation(singleResources, plan.parameters.width, plan.parameters.seed);
  const authoredArea =
    areaBrushIds.size === 0
      ? []
      : population
        ? population.treeInstances.filter(
            (instance) =>
              instance.authoringBrushId !== undefined &&
              areaBrushIds.has(instance.authoringBrushId) &&
              !removed.has(instance.id)
          )
        : compileAuthoredVegetation(
            [...allResources.filter((resource) => resource.resourceType === "object-removal"), ...areaBrushResources],
            plan.parameters.width,
            plan.parameters.seed
          );
  const authored = [...authoredSingle, ...authoredArea];
  const indexedAssets = new Map(assets.map((asset) => [asset.id, asset]));
  const templateLandscape = plan.parameters.worldTemplate?.id
    ? WORLD_TEMPLATE_ART[plan.parameters.worldTemplate.id]?.landscape
    : undefined;
  const speciesAt = createNaturalTreeSpeciesRegions(plan.parameters.seed);
  return [
    ...generated,
    ...authored.map((plant): LandscapePlantInstance => {
      const placement = resolveSeedWorldAssetPlacement(plant.intent);
      const profile = getSeedWorldAssetPlacementProfile(plant.intent.profileKey);
      const baseHeight = profile.geometry.verticalBoundsMetres[1] * placement.scale[1];
      const useTemplateTreeHeight =
        plant.category === "tree" &&
        templateLandscape?.treeHeightMinM !== undefined &&
        templateLandscape?.treeHeightMaxM !== undefined &&
        templateLandscape.treeHeightMaxM >= templateLandscape.treeHeightMinM;
      const height = useTemplateTreeHeight
        ? templateLandscape.treeHeightMinM! +
          (templateLandscape.treeHeightMaxM! - templateLandscape.treeHeightMinM!) * plant.intent.sizeRank
        : baseHeight;
      const center = {
        x: plant.normalizedPosition.x * plan.parameters.width,
        z: plant.normalizedPosition.y * plan.parameters.width
      };
      const basePalette =
        plant.category === "tree" ? NATURAL_VEGETATION_PALETTES.trees : NATURAL_VEGETATION_PALETTES.shrubs;
      const filteredPalette = basePalette.filter((id) => !excludedAssetIds.has(id));
      const palette = filteredPalette.length > 0 ? filteredPalette : basePalette;
      let assetId =
        plant.category === "tree"
          ? naturalTreeDimensions(plan.parameters.seed, plant.id, height, center).assetId
          : palette[plant.prototypeRank % palette.length];
      if (plant.category === "tree" && excludedAssetIds.has(assetId)) {
        assetId = palette[plant.prototypeRank % palette.length];
      }
      const asset = indexedAssets.get(assetId);
      if (!asset) throw new Error(`Missing authored plant asset: ${assetId}`);
      const spans = asset.bounds.max.map((v, axis) => v - asset.bounds.min[axis]);
      const dimensions = useTemplateTreeHeight
        ? [(spans[0] / spans[1]) * height, height, (spans[2] / spans[1]) * height]
        : [plant.footprintMetres[0], height, plant.footprintMetres[1]];
      if (![...spans, ...dimensions].every((v) => Number.isFinite(v) && v > 0))
        throw new Error(`Invalid authored plant dimensions: ${plant.id}`);
      const scale = Math.min(...dimensions.map((v, axis) => v / spans[axis]));
      const ownerId = plant.authoringBrushId ?? plant.id;
      const treeSpecies =
        plant.category === "tree" ? PLANT_TREE_SPECIES.find((species) => species.assetId === assetId) : undefined;
      const treeRegion = treeSpecies ? speciesAt([center.x, center.z], plant.id) : undefined;
      const foliageVar = treeSpecies ? PLANT_FOLIAGE_VARIATIONS.get(assetId) : undefined;
      const barkVar = treeSpecies ? PLANT_BARK_VARIATIONS.get(assetId) : undefined;
      return {
        id: plant.id,
        assetId,
        layerId: plant.category === "tree" ? "乔木" : "小灌木",
        clusterId: ownerId,
        scopeId: ownerId,
        ...(treeSpecies && treeRegion && foliageVar
          ? {
              appearance: {
                foliage: vegetationColorVariation(
                  plan.parameters.seed,
                  treeSpecies.speciesGroup,
                  plant.id,
                  treeRegion,
                  foliageVar,
                  "foliage"
                ),
                ...(barkVar
                  ? {
                      bark: vegetationColorVariation(
                        plan.parameters.seed,
                        treeSpecies.speciesGroup,
                        plant.id,
                        treeRegion,
                        barkVar,
                        "bark"
                      )
                    }
                  : {})
              }
            }
          : {}),
        position: [center.x, ground.sample(center), center.z],
        yaw: (plant.yawRadians * 180) / Math.PI,
        scale,
        height: spans[1] * scale,
        radius: (Math.hypot(spans[0], spans[2]) * scale) / 2,
        ...(asset.groundingOffset !== undefined ? { groundingOffset: asset.groundingOffset * scale } : {})
      };
    })
  ];
}

/** Pure projection of a published world into independent native vegetation candidates.
 * Stable cells bound construction; camera position only controls residency in the renderer.
 * The physical region stays the world, so cell boundaries do not create bare strips.
 */
export class PlanningNaturalVegetation {
  readonly trees: readonly LandscapePlantInstance[];
  private readonly associationTrees: readonly LandscapePlantInstance[];
  private readonly solids: readonly { id: string; outline: PlanPoint[] }[];
  readonly layers: readonly NaturalVegetationLayerRule[];
  readonly anchors: readonly VegetationCompanionAnchor[];
  private readonly grass: Uint8Array;
  private readonly densityAt: ReturnType<typeof naturalVegetationAt>;
  private readonly flowerCoverage: ReturnType<typeof vegetationCoverage>;
  private readonly flowerRegions: NonNullable<IslandPlan["flowerRegions"]>;
  private readonly flowerAssetWeights: Readonly<Record<string, Readonly<Record<string, number>>>>;
  private readonly stoneCompanion: boolean;
  private readonly footprints: {
    solids: readonly PlantingFootprint[];
    roads: readonly PlantingRoad[];
    waters: readonly PlantingFootprint[];
    plazas: readonly PlantingFootprint[];
  };
  private groundExclusions: readonly PlantingFootprint[] = [];
  setGroundExclusions(outlines: readonly (readonly PlanPoint[])[]): void {
    this.groundExclusions = outlines.map((outline, i) =>
      plantingFootprint(
        `occupied-ground-${i}`,
        outline.map((p) => ({ ...p }))
      )
    );
  }
  constructor(
    private readonly plan: IslandPlan,
    private readonly height: PlanningHeightmap,
    private readonly fields: SeedWorldFields,
    population: SeedWorldPopulationPreview,
    private readonly assets: readonly PlanningPlantAsset[],
    private readonly presentation?: ReturnType<typeof subjectViewLandscape>,
    excludedAssetIds: ReadonlySet<string> = SEED_WORLD_NATURAL_VEGETATION_EXCLUDED_ASSET_IDS
  ) {
    this.densityAt = naturalVegetationAt(plan);
    this.flowerCoverage = vegetationCoverage(plan);
    this.flowerRegions = plan.flowerRegions ?? [];
    this.flowerAssetWeights = Object.fromEntries(
      (plan.flowerRegions ?? []).map((region) => [
        region.id,
        resolveGeneratedFlowerAssetWeights(
          plan.parameters.seed,
          region.ownerId ?? region.id,
          region.config.assetWeights
        )
      ])
    );
    this.trees = planningNaturalTrees(plan, height, assets, excludedAssetIds);
    const state = plan.spatialLayout,
      slots = state?.landscapeBase?.slots;
    const sources = state?.baselineLandscapes ?? plan.landscapes ?? [];
    const slotIds = new Set(slots?.map((slot) => slot.id));
    const associationPlan = {
      ...plan,
      landscapes: slots ? [...slots, ...sources.filter((item) => !slotIds.has(item.id))] : [...sources]
    };
    applyLandscapeEdits(associationPlan, state?.instanceEdits ?? {}, (point) => height.sample(point));
    const landscapes = associationPlan.landscapes;
    this.associationTrees = planningNaturalTrees(associationPlan, height, assets, excludedAssetIds);
    this.solids = [...plan.buildings, ...plan.rocks, ...landscapes.filter((item) => item.kind === "rock")];
    const stoneCompanionCfg = WORLD_TEMPLATE_ART[plan.parameters.worldTemplate?.id ?? ""]?.stoneCompanionPlanting;
    const stoneCompanion = Boolean(stoneCompanionCfg);
    const maxMediumRockRadiusM =
      typeof stoneCompanionCfg === "object" && stoneCompanionCfg.maxRockRadiusM !== undefined
        ? stoneCompanionCfg.maxRockRadiusM
        : 8;
    const baselineRocks = plan.rocks;
    const anchorTrees = stoneCompanion ? this.trees : this.associationTrees;
    const anchorRocks = stoneCompanion
      ? [...baselineRocks, ...(plan.landscapes ?? []).filter((p) => p.kind === "rock")]
      : [...baselineRocks, ...landscapes.filter((p) => p.kind === "rock")];
    this.anchors = [
      ...anchorTrees,
      ...anchorRocks.map((rock) => {
        const radius = Math.hypot(rock.width, rock.depth) / 2;
        return {
          id: rock.id,
          layerId: stoneCompanion && radius <= maxMediumRockRadiusM ? "中等石头" : "岩石",
          position: [rock.center.x, height.sample(rock.center), rock.center.z] as const,
          radius
        };
      })
    ];
    this.grass = population.detailDensityFields.find((field) => field.category === "grass")!.samples;
    // These layers multiply the same substrate field in sample(). A globally
    // zero field cannot accept any candidate, including fixed-basemap companions.
    // Prove that once before spending a cell's candidate budget; flowers and stones
    // have independent suitability and must retain their own generation rules.
    const hasSubstrate = this.grass.some((value, index) => value > 0 && !fields.waterMask[index]);
    const distribution = plan.naturalVegetation ?? publishNaturalVegetation(plan);
    const hasPositiveLayerAbundance = (layerId: string) => {
      const key = NATURAL_VEGETATION_CONTROLS.find((control) => control.label === layerId)?.key;
      if (!key) return true;
      if ((distribution.world[key] ?? 0) > 0) return true;
      return Object.values(distribution.regions).some((region) => (region[key] ?? 0) > 0);
    };
    const stoneDensity =
      plan.naturalVegetation?.settings.companionStoneDensity ?? NATURAL_VEGETATION_DEFAULTS.companionStoneDensity;
    const stones =
      stoneDensity > 0 &&
      (worldTemplate(plan.parameters.worldTemplate?.id)?.vegetation as string | undefined) !== "grass"
        ? createNaturalCompanionStoneLayer(assets.filter((asset) => asset.kind === "stone"))
        : undefined;
    this.stoneCompanion = stoneCompanion;
    // Anchor strictly to medium boulders ("中等石头", <= maxMediumRockRadiusM) and tree-foot boulders ("树脚石块")
    // rather than giant horizon mountain outcrops ("岩石").
    const stoneCompanionPatches = {
      anchorLayers: ["中等石头", "树脚石块"] as const,
      centerRadiusRatio: 1.9,
      patchRadiusRatio: 1.45,
      coverage: 0.84,
      aspectRatio: [1, 1.5] as const
    };
    const withStoneCompanion = (layer: NaturalVegetationLayerRule): NaturalVegetationLayerRule => {
      if (!stoneCompanion) return layer;
      if (layer.id === "小灌木") {
        return {
          ...layer,
          companionPlanting: {
            patches: stoneCompanionPatches,
            strength: 1,
            densityMultiplier: 1,
            densityPerM2: 0.34
          }
        };
      }
      return layer;
    };
    this.layers = [
      ...(stones ? [stones] : []),
      ...createNaturalVegetationLayers(
        assets,
        excludedAssetIds,
        plan.parameters.seed,
        plan.naturalVegetation?.plantSizes
      )
        .filter((layer) => layer.id !== "低草铺底")
        .map((layer) =>
          layer.id === "乔木"
            ? { ...layer, density: 0 }
            : layer.id === "零星野花"
              ? withStoneCompanion({
                  ...layer,
                  density:
                    this.flowerRegions.some((r) => r.config.densityPerM2 > 0) && hasPositiveLayerAbundance("零星野花")
                      ? FLOWER_DEFAULTS.densityPerM2
                      : 0,
                  maxSlopeDegrees: 90,
                  palette: layer.palette.map((member) => ({ ...member, weight: 1 }))
                })
              : hasSubstrate && hasPositiveLayerAbundance(layer.id)
                ? withStoneCompanion(layer)
                : { ...layer, density: 0 }
        )
    ];
    // Published geometry is immutable for this planner; camera cells only query its prepared footprints.
    this.footprints = {
      solids: this.solids.map((solid) => plantingFootprint(solid.id, solid.outline)),
      roads: plan.routes
        .filter((route) => route.points.length > 1)
        .map((route) =>
          plantingFootprint(
            route.id,
            route.outline ??
              ribbonOutline(
                route.points,
                route.widths ?? route.points.map(() => route.width),
                route.caps,
                true,
                route.closed
              )
          )
        ),
      waters: plan.waters.map((water) => plantingFootprint(water.id, water.outline, water.lake?.holes)),
      plazas: (plan.plazas ?? []).map((plaza) => plantingFootprint(plaza.id, plaza.outline))
    };
  }
  compileCell(x: number, z: number) {
    const steps = this.compileCellSteps(x, z);
    for (;;) {
      const next = steps.next();
      if (next.done) return next.value;
    }
  }
  *compileCellSteps(x: number, z: number) {
    const { width, depth, seed } = this.plan.parameters,
      cell = SEED_WORLD_POPULATION_CELL_METRES;
    const settings = this.plan.naturalVegetation?.settings ?? NATURAL_VEGETATION_DEFAULTS;
    const min = [x * cell, z * cell] as const,
      max = [Math.min(width, (x + 1) * cell), Math.min(depth, (z + 1) * cell)] as const;
    const nearbyAnchors = this.anchors.filter((anchor) => {
      const reach = companionAnchorReach(anchor.radius, NATURAL_VEGETATION_COMPANION_PATCHES);
      return (
        anchor.position[0] + reach >= min[0] &&
        anchor.position[0] - reach <= max[0] &&
        anchor.position[2] + reach >= min[1] &&
        anchor.position[2] - reach <= max[1]
      );
    });
    const cellHasTreeAnchors = nearbyAnchors.some((anchor) => anchor.layerId === "乔木");
    const cellHasStoneCompanionAnchors =
      cellHasTreeAnchors || nearbyAnchors.some((anchor) => anchor.layerId === "中等石头");
    let cellHasGrassSubstrate = false;
    {
      const resolution = this.fields.surfaceResolution,
        n = resolution - 1;
      const minX = Math.max(0, Math.floor((min[0] / width) * n)),
        maxX = Math.min(n, Math.ceil((max[0] / width) * n)),
        minZ = Math.max(0, Math.floor((min[1] / depth) * n)),
        maxZ = Math.min(n, Math.ceil((max[1] / depth) * n));
      outerGrass: for (let iz = minZ; iz <= maxZ; iz++) {
        const row = iz * resolution;
        for (let ix = minX; ix <= maxX; ix++) {
          const i = row + ix;
          if (this.grass[i] > 0 && !this.fields.waterMask[i]) {
            cellHasGrassSubstrate = true;
            break outerGrass;
          }
        }
      }
    }
    let cellHasFlowers = false;
    if (this.flowerRegions.length > 0) {
      const field = this.flowerCoverage,
        n = field.resolution - 1;
      const minX = Math.max(0, Math.floor((min[0] / width) * n)),
        maxX = Math.min(n, Math.ceil((max[0] / width) * n)),
        minZ = Math.max(0, Math.floor((min[1] / depth) * n)),
        maxZ = Math.min(n, Math.ceil((max[1] / depth) * n));
      outerFlowers: for (let iz = minZ; iz <= maxZ; iz++) {
        const row = iz * field.resolution;
        for (let ix = minX; ix <= maxX; ix++) {
          const i = row + ix;
          if (field.flowers[i] > 0 && this.flowerRegions[field.ownership.samples[i] - 1]) {
            cellHasFlowers = true;
            break outerFlowers;
          }
        }
      }
    }
    const cellLayers = this.layers.map((layer) => {
      if (layer.density === 0) return layer;
      if (layer.id === "树脚石块") return cellHasTreeAnchors ? layer : { ...layer, density: 0 };
      if (this.stoneCompanion && layer.id === "小灌木")
        return cellHasStoneCompanionAnchors ? layer : { ...layer, density: 0 };
      if (layer.id === "零星野花") return cellHasFlowers ? layer : { ...layer, density: 0 };
      return cellHasGrassSubstrate ? layer : { ...layer, density: 0 };
    });
    const plantRadius = Math.max(
      0,
      ...cellLayers
        .filter((layer) => layer.density > 0)
        .flatMap((layer) =>
          layer.palette.map(
            (member) =>
              this.assets.find((asset) => asset.id === member.assetId)!.radius *
              (member.scale ?? layer.scale)[1] *
              (member.horizontalVariation?.[1] ?? 1)
          )
        )
    );
    const margin = Math.max(plantRadius, settings.roadsideBandM, settings.solidEdgeBandM);
    const footprintIntersects = (shape: PlantingFootprint, reach = margin) =>
      shape.outline.length > 0 &&
      shape.bounds[1] >= min[0] - reach &&
      shape.bounds[0] <= max[0] + reach &&
      shape.bounds[3] >= min[1] - reach &&
      shape.bounds[2] <= max[1] + reach;
    const solids = this.footprints.solids.filter((solid) => footprintIntersects(solid));
    const routes = this.footprints.roads.filter((route) => footprintIntersects(route));
    for (const route of routes) route.query ??= createLandscapeRingQuery(route.outer);
    // The published footprint is the boundary, including bends and variable road widths.
    // A seam has full width on both sides; its inner half remains excluded by the footprint.
    const edgeSeams = (edges: readonly PlantingFootprint[], bandM: number, densityMultiplier: number) =>
      bandM === 0 || densityMultiplier === 1
        ? []
        : edges.map((edge) => ({
            id: edge.id,
            points: [...edge.outer, edge.outer[0]],
            width: bandM * 2,
            layers: NATURAL_VEGETATION_EDGE_LAYERS,
            densityMultiplier
          }));
    const seams = [
      ...edgeSeams(solids, settings.solidEdgeBandM, settings.solidEdgeDensityMultiplier),
      ...edgeSeams(routes, settings.roadsideBandM, settings.roadsideDensityMultiplier)
    ];
    const request: Parameters<typeof compileNaturalVegetationCell>[0] = {
      regionId: `planning-natural-${x}-${z}`,
      seed,
      region: {
        outer: [
          [0, 0],
          [width, 0],
          [width, depth],
          [0, depth]
        ]
      },
      views: this.presentation ? [this.presentation.view] : [],
      focalTargets: this.presentation ? [this.presentation.focus] : [],
      exclusions: [
        ...this.groundExclusions.map((shape) => ({ id: shape.id, clearance: 0, polygon: { outer: shape.outer } })),
        ...solids.map((solid) => ({ id: solid.id, polygon: { outer: solid.outer }, clearance: 0 })),
        ...this.footprints.waters
          .filter((water) => footprintIntersects(water))
          .map((water) => ({
            id: water.id,
            polygon: { outer: water.outer, ...(water.holes?.length ? { holes: water.holes } : {}) },
            clearance: 0
          })),
        ...this.footprints.plazas
          .filter((plaza) => footprintIntersects(plaza))
          .map((plaza) => ({
            id: plaza.id,
            polygon: { outer: plaza.outer },
            clearance: 0
          }))
      ],
      seams,
      layers: cellLayers,
      budget: naturalVegetationSamplingBudget((max[0] - min[0]) * (max[1] - min[1]))
    };
    const densityKeys = new Map(
      this.layers.map((layer) => [
        layer.id,
        NATURAL_VEGETATION_CONTROLS.find((control) => control.label === layer.id)?.key
      ])
    );
    const density = (x: number, z: number, layerId: string) => {
      const resolution = this.fields.surfaceResolution;
      const i =
        Math.min(resolution - 1, Math.max(0, Math.round((z / depth) * (resolution - 1)))) * resolution +
        Math.min(resolution - 1, Math.max(0, Math.round((x / width) * (resolution - 1))));
      if (this.fields.waterMask[i]) return 0;
      if (layerId === "树脚石块")
        return settings.companionStoneDensity ?? NATURAL_VEGETATION_DEFAULTS.companionStoneDensity;
      if (layerId === "零星野花") return this.densityAt({ x, z }).flowers!;
      if (this.stoneCompanion && (layerId === "小灌木" || layerId === "高草与杂草")) {
        return this.densityAt({ x, z })[densityKeys.get(layerId)!]!;
      }
      return (this.grass[i] / 255) * this.densityAt({ x, z })[densityKeys.get(layerId)!]!;
    };
    const sample = (x: number, z: number) => {
      const dx = this.height.spacingX,
        dz = this.height.spacingZ;
      const slopeX =
        (this.height.sample({ x: Math.min(width, x + dx), z }) - this.height.sample({ x: Math.max(0, x - dx), z })) /
        (Math.min(width, x + dx) - Math.max(0, x - dx));
      const slopeZ =
        (this.height.sample({ x, z: Math.min(depth, z + dz) }) - this.height.sample({ x, z: Math.max(0, z - dz) })) /
        (Math.min(depth, z + dz) - Math.max(0, z - dz));
      return {
        height: this.height.sample({ x, z }),
        slopeDegrees: (Math.atan(Math.hypot(slopeX, slopeZ)) * 180) / Math.PI
      };
    };
    return yield* compileNaturalVegetationCellSteps(request, this.assets, sample, {
      bounds: { min, max },
      anchors: nearbyAnchors,
      density,
      excludes: (point, radius) => routes.some((route) => route.query!.intersects(point, radius)),
      edgeMultiplier: (layerId) =>
        NATURAL_VEGETATION_EDGE_LAYERS.includes(layerId)
          ? Math.max(
              1,
              settings.roadsideBandM > 0 ? settings.roadsideDensityMultiplier : 1,
              settings.solidEdgeBandM > 0 ? settings.solidEdgeDensityMultiplier : 1
            )
          : 1,
      populationAreas: {},
      populationFields: {
        零星野花: {
          ratePerM2: cellHasFlowers
            ? Math.max(FLOWER_DEFAULTS.densityPerM2, ...this.flowerRegions.map((region) => region.config.densityPerM2))
            : 0,
          at: (x, z) => {
            const field = this.flowerCoverage,
              n = field.resolution - 1;
            const index =
              Math.max(0, Math.min(n, Math.round((z / depth) * n))) * field.resolution +
              Math.max(0, Math.min(n, Math.round((x / width) * n)));
            const region = this.flowerRegions[field.ownership.samples[index] - 1];
            if (!region || !field.flowers[index]) return;
            return {
              scopeId: region.id,
              densityPerM2: (region.config.densityPerM2 * field.flowers[index]) / 255,
              maxSlopeDegrees: region.config.maxSlopeDegrees
            };
          }
        }
      },
      populationAssetWeights: { 零星野花: this.flowerAssetWeights }
    });
  }
}

type RoadEdgeEntry = Float64Array | WeakRef<Float64Array>;

function readRoadEdgeEntry(entry: RoadEdgeEntry | undefined): Float64Array | undefined {
  if (!entry) return undefined;
  return entry instanceof Float64Array ? entry : entry.deref();
}

function wrapRoadEdgeEntry(edges: Float64Array): RoadEdgeEntry {
  return typeof WeakRef !== "undefined" ? new WeakRef(edges) : edges;
}

interface GroundProjection {
  source: SeedWorldPopulationPreview;
  result: SeedWorldPopulationPreview;
  signature: string;
  flowers: string;
  roadEdges: ReadonlyMap<number, RoadEdgeEntry>;
}
// Weakly keyed by immutable source preview so retired projections are garbage-collected automatically.
const groundProjections = new WeakMap<SeedWorldPopulationPreview, GroundProjection>();
const GROUND_PREPARATION_SLICE_MILLISECONDS = 12;
function hashGroundProjectionBlock(bytes: Uint8Array, start: number, hash: number): number {
  const end = Math.min(bytes.length, start + 65536);
  for (let i = start; i < end; i++) hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0;
  return hash;
}
function groundProjectionSignature(
  population: SeedWorldPopulationPreview,
  density?: number,
  plan?: IslandPlan,
  assets?: readonly PlanningPlantAsset[]
): string | undefined {
  if (!plan || !assets) return;
  return hashCanonicalKey(
    JSON.stringify([
      density,
      plan.parameters.seed,
      plan.parameters.width,
      plan.parameters.depth,
      plan.naturalVegetation ?? publishNaturalVegetation(plan),
      assets,
      plan.poiDistribution?.domains,
      plan.poiDistribution?.sites.map((site) => [
        site.id,
        site.active,
        site.center,
        site.domainId,
        site.sizeWeight ?? 1,
        site.weightM2
      ]),
      plan.routes.map((route) => route.outline),
      population.detailDensityFields.map((field) =>
        field.category === "grass"
          ? [
              field.category,
              field.prototypeFamily,
              field.assetProfileKey,
              field.resolution,
              field.maximumDensityPerSquareMetre,
              field.candidateSeed ?? field.hash
            ]
          : [field.category, field.resolution, field.samples.length]
      )
    ])
  );
}
function groundFlowerSignature(plan?: IslandPlan): string {
  const regions = plan?.flowerRegions
    ?.filter((region) => region.config.densityPerM2 > 0)
    .map((region) => [region.id, region.config.assetWeights, region.outlines])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify(regions ?? []);
}
function rememberGroundProjection(
  source: SeedWorldPopulationPreview,
  result: SeedWorldPopulationPreview,
  roadEdges: ReadonlyMap<number, RoadEdgeEntry>,
  signature?: string,
  plan?: IslandPlan
): SeedWorldPopulationPreview {
  if (signature) {
    groundProjections.set(source, { source, result, signature, flowers: groundFlowerSignature(plan), roadEdges });
  }
  return result;
}
/** Native Terrain/Grass owns the carpet; the meadow owns the other plants.
 * Synchronous consumers use the same complete projection as cooperative scene preparation. */
export function planningNaturalGroundPopulation(
  population: SeedWorldPopulationPreview,
  grassDensity?: number,
  plan?: IslandPlan,
  assets?: readonly PlanningPlantAsset[]
): SeedWorldPopulationPreview {
  const roadEdges = new Map<number, RoadEdgeEntry>();
  const steps = planningNaturalGroundPopulationSteps(population, roadEdges, grassDensity, plan, assets);
  while (true) {
    const next = steps.next();
    if (next.done)
      return rememberGroundProjection(
        population,
        next.value,
        roadEdges,
        groundProjectionSignature(population, grassDensity, plan, assets),
        plan
      );
  }
}

export async function preparePlanningNaturalGroundPopulation(
  population: SeedWorldPopulationPreview,
  grassDensity: number | undefined,
  plan: IslandPlan,
  assets: readonly PlanningPlantAsset[],
  signal: AbortSignal,
  previous?: SeedWorldPopulationPreview
): Promise<SeedWorldPopulationPreview> {
  const signature = groundProjectionSignature(population, grassDensity, plan, assets);
  const cached = previous ? groundProjections.get(previous) : undefined;
  const reuse = cached?.signature === signature ? cached : undefined;
  const roadEdges = new Map(reuse?.roadEdges);
  const steps = planningNaturalGroundPopulationSteps(population, roadEdges, grassDensity, plan, assets, reuse);
  let deadline = performance.now() + GROUND_PREPARATION_SLICE_MILLISECONDS;
  while (true) {
    signal.throwIfAborted();
    const next = steps.next();
    if (next.done) return rememberGroundProjection(population, next.value, roadEdges, signature, plan);
    if (performance.now() >= deadline) {
      await yieldSeedWorldPreparationTask();
      signal.throwIfAborted();
      deadline = performance.now() + GROUND_PREPARATION_SLICE_MILLISECONDS;
    }
  }
}

function* planningNaturalGroundPopulationSteps(
  population: SeedWorldPopulationPreview,
  roadEdges: Map<number, RoadEdgeEntry>,
  grassDensity?: number,
  plan?: IslandPlan,
  assets?: readonly PlanningPlantAsset[],
  previous?: GroundProjection
): Generator<void, SeedWorldPopulationPreview> {
  if (grassDensity !== undefined && (!Number.isFinite(grassDensity) || grassDensity < 0))
    throw new Error("Invalid natural ground-cover density");
  const densityAt = plan ? naturalVegetationAt(plan) : undefined;
  const settings = plan?.naturalVegetation?.settings ?? NATURAL_VEGETATION_DEFAULTS;
  const layers = assets
    ? createNaturalVegetationLayers(
        assets,
        SEED_WORLD_NATURAL_VEGETATION_EXCLUDED_ASSET_IDS,
        plan?.parameters.seed,
        plan?.naturalVegetation?.plantSizes
      )
    : [];
  const shortest = (id: string) => {
    const layer = layers.find((layer) => layer.id === id)!;
    return Math.min(
      ...layer.palette.map(
        (member) =>
          assets!.find((asset) => asset.id === member.assetId)!.height *
          (member.heightScale ?? member.scale ?? layer.scale)[0]
      )
    );
  };
  const heights = assets ? { shrubs: shortest("小灌木"), grass: shortest("低草铺底") } : undefined;
  const flowerLayer = layers.find((layer) => layer.id === "零星野花");
  const flowerHeights =
    plan && assets && flowerLayer
      ? (plan.flowerRegions ?? [])
          .filter((region) => region.config.densityPerM2 > 0)
          .map((region) => {
            // The regional flower solver uses the same native assets and layer growth range.
            const height = Math.min(
              ...flowerAssetMembers(region.config.assetWeights).map((member) => {
                const asset = assets.find((asset) => asset.id === member.assetId);
                if (!asset) throw new Error(`Missing planned flower asset: ${member.assetId}`);
                const growth = flowerLayer.palette.find((species) => species.assetId === member.assetId);
                return asset.height * (growth?.heightScale ?? growth?.scale ?? flowerLayer.scale)[0];
              })
            );
            return { height, rings: region.outlines.map(createPlanningRingQuery) };
          })
          .filter((region) => Number.isFinite(region.height))
      : [];
  const roads =
    plan?.routes.filter((route) => route.outline?.length).map((route) => createPlanningRingQuery(route.outline!)) ?? [];
  // Farm clearings are reversible runtime overlays; the facility envelope must not erase the author source.
  const flowerField = population.detailDensityFields.find((field) => field.category === "flower");
  const oldFlowers = previous?.source.detailDensityFields.find((field) => field.category === "flower");
  const flowerContextChanged = previous ? previous.flowers !== groundFlowerSignature(plan) : false;
  const detailDensityFields: SeedWorldPopulationPreview["detailDensityFields"][number][] = [];
  for (const field of population.detailDensityFields.filter((field) => field.category === "grass")) {
    const resolution = Math.sqrt(field.samples.length);
    const oldSource = previous?.source.detailDensityFields.find((old) => old.prototypeFamily === field.prototypeFamily);
    const oldField = previous?.result.detailDensityFields.find((old) => old.prototypeFamily === field.prototypeFamily);
    const cachedEdges = readRoadEdgeEntry(roadEdges.get(field.samples.length));
    const grassRelHeight = settings.grassRelativeHeight;
    const lowerMult = 1 - settings.grassHeightVariation;
    const shrubHeight = heights?.shrubs ?? 0;
    const grassHeight = heights?.grass ?? 0;
    const maxFlowerHeight = flowerHeights.reduce((best, region) => Math.max(best, region.height), 0);
    const currentUpperBound =
      Math.max(grassHeight, shrubHeight, maxFlowerHeight) *
      grassRelHeight *
      Math.max(1, settings.roadsideGrassHeightRatio);
    const useCompactUint16 =
      Boolean(plan && heights) &&
      Number.isFinite(currentUpperBound) &&
      currentUpperBound > 0 &&
      Number.isFinite(lowerMult) &&
      lowerMult > 0 &&
      lowerMult <= 1;
    const reusableBase =
      oldSource && oldField?.heightRangeMetres && cachedEdges && oldField.samples.length === field.samples.length
        ? oldField
        : undefined;
    const reusableHeight = reusableBase?.heightRangeMetres;
    const reusable =
      reusableBase &&
      (useCompactUint16
        ? reusableHeight?.samples instanceof Uint16Array &&
          reusableHeight.encodeScale !== undefined &&
          reusableHeight.encodeScale >= currentUpperBound &&
          reusableHeight.lowerMultiplier === lowerMult
        : reusableHeight?.samples instanceof Float32Array)
        ? reusableBase
        : undefined;
    const groundSamples = densityAt
      ? reusable
        ? new Uint8Array(reusable.samples)
        : new Uint8Array(field.samples.length)
      : field.samples;
    const groundDensity = (index: number, grass: number) => Math.round(field.samples[index] * grass);
    let heightRangeMetres: typeof field.heightRangeMetres;
    if (plan && heights) {
      // Float64 retains the exact JS distance/falloff result; this depends on roads/settings, not water.
      const edges = cachedEdges ?? new Float64Array(field.samples.length);
      const width = plan.parameters.width,
        depth = plan.parameters.depth;
      const invResMinus1 = 1 / (resolution - 1);
      if (!cachedEdges) {
        roadEdges.set(field.samples.length, wrapRoadEdgeEntry(edges));
        const band = settings.roadsideBandM;
        if (band > 0) {
          // Initialize to full distance ratio (1.0) and only evaluate pixels inside each road's expanded AABB.
          edges.fill(1);
          const distances = new Float64Array(field.samples.length).fill(band);
          const routeOutlines = plan.routes.filter((route) => route.outline?.length);
          const pt = { x: 0, z: 0 };
          for (let r = 0; r < roads.length; r++) {
            const road = roads[r];
            const outline = routeOutlines[r].outline!;
            let minX = Infinity,
              maxX = -Infinity,
              minZ = Infinity,
              maxZ = -Infinity;
            for (const q of outline) {
              if (q.x < minX) minX = q.x;
              if (q.x > maxX) maxX = q.x;
              if (q.z < minZ) minZ = q.z;
              if (q.z > maxZ) maxZ = q.z;
            }
            const col0 = Math.max(0, Math.floor(((minX - band) / width) * (resolution - 1)));
            const col1 = Math.min(resolution - 1, Math.ceil(((maxX + band) / width) * (resolution - 1)));
            const row0 = Math.max(0, Math.floor(((minZ - band) / depth) * (resolution - 1)));
            const row1 = Math.min(resolution - 1, Math.ceil(((maxZ + band) / depth) * (resolution - 1)));
            for (let row = row0; row <= row1; row++) {
              pt.z = row * invResMinus1 * depth;
              const rowOff = row * resolution;
              for (let col = col0; col <= col1; col++) {
                pt.x = col * invResMinus1 * width;
                const idx = rowOff + col;
                const current = distances[idx];
                if (current > 0 && road.within(pt, band)) {
                  const d = road.distance(pt, current);
                  if (d < current) distances[idx] = d;
                }
              }
            }
          }
          const ratioBase = settings.roadsideGrassHeightRatio;
          const ratioSpan = 1 - ratioBase;
          const invBand = 1 / band;
          for (let i = 0; i < distances.length; i++) {
            const d = distances[i];
            if (d < band) {
              const t = d * invBand;
              edges[i] = ratioBase + ratioSpan * t * t * (3 - 2 * t);
            }
          }
        } else {
          edges.fill(1);
        }
      }
      const encodeScale = useCompactUint16 ? (reusable?.heightRangeMetres?.encodeScale ?? currentUpperBound) : 0;
      const samples = useCompactUint16
        ? reusable
          ? new Uint16Array(reusable.heightRangeMetres!.samples as Uint16Array)
          : new Uint16Array(field.samples.length)
        : reusable
          ? new Float32Array(reusable.heightRangeMetres!.samples)
          : new Float32Array(field.samples.length * 2);
      let minimum = Infinity,
        maximum = 0;
      const p = { x: 0, z: 0 };
      const flowerSamples = flowerField?.samples;
      const oldFlowerSamples = oldFlowers?.samples;
      const oldSrcSamples = oldSource?.samples;
      const srcSamples = field.samples;
      for (let index = 0; index < srcSamples.length; index++) {
        if (index > 0 && index % (resolution * 16) === 0) yield;
        if (
          reusable &&
          oldSrcSamples![index] === srcSamples[index] &&
          Boolean(oldFlowerSamples?.[index]) === Boolean(flowerSamples?.[index]) &&
          (!flowerContextChanged || !flowerSamples?.[index])
        ) {
          let lo: number, hi: number;
          if (samples instanceof Uint16Array) {
            hi = (samples[index]! / 65535) * encodeScale;
            lo = hi * lowerMult;
          } else {
            lo = samples[index * 2]!;
            hi = samples[index * 2 + 1]!;
          }
          if (lo < minimum) minimum = lo;
          if (hi > maximum) maximum = hi;
          continue;
        }
        p.x = (index % resolution) * invResMinus1 * width;
        p.z = Math.floor(index / resolution) * invResMinus1 * depth;
        const density = densityAt!(p);
        // Both projections sample the same immutable ecology at this point; evaluate it once.
        groundSamples[index] = Math.round(srcSamples[index] * density.grass!);
        let flowerHeight = Infinity;
        if (density.flowers! > 0 && flowerSamples?.[index]) {
          for (let f = 0; f < flowerHeights.length; f++) {
            const region = flowerHeights[f];
            if (region.height < flowerHeight) {
              let inside = false;
              for (let k = 0; k < region.rings.length; k++) {
                if (region.rings[k].inside(p)) inside = !inside;
              }
              if (inside) flowerHeight = region.height;
            }
          }
        }
        // The active community's shortest accent plant sets the low-grass ceiling.
        // Empty grassland uses the authored grass species rather than an invented metre height.
        const accent = Math.min(density.shrubs! > 0 ? shrubHeight : Infinity, flowerHeight);
        const reference = Number.isFinite(accent) ? accent : grassHeight;
        const upper = reference * grassRelHeight * edges[index];
        let fLo: number, fHi: number;
        if (samples instanceof Uint16Array) {
          let q = Math.min(65535, Math.max(0, Math.round((upper / encodeScale) * 65535)));
          if (upper > 0 && q === 0) q = 1;
          samples[index] = q;
          fHi = (q / 65535) * encodeScale;
          fLo = fHi * lowerMult;
        } else {
          samples[index * 2] = upper * lowerMult;
          samples[index * 2 + 1] = upper;
          fLo = samples[index * 2];
          fHi = samples[index * 2 + 1];
        }
        if (fLo < minimum) minimum = fLo;
        if (fHi > maximum) maximum = fHi;
      }
      heightRangeMetres = useCompactUint16
        ? { samples: samples as Uint16Array, minimum, maximum, encodeScale, lowerMultiplier: lowerMult }
        : { samples: samples as Float32Array, minimum, maximum };
    }
    // Height edits retain the original candidate identity, positions and colour variation.
    let hash = field.hash;
    if (heightRangeMetres) {
      const bytes = new Uint8Array(
        heightRangeMetres.samples.buffer,
        heightRangeMetres.samples.byteOffset,
        heightRangeMetres.samples.byteLength
      );
      for (let i = 0; i < bytes.length; i += 65536) {
        if (i > 0) yield;
        hash = hashGroundProjectionBlock(bytes, i, hash);
      }
      if (heightRangeMetres.encodeScale !== undefined) {
        hash = Math.imul(hash ^ Math.round(heightRangeMetres.encodeScale * 1e6), 16777619) >>> 0;
        hash = Math.imul(hash ^ Math.round((heightRangeMetres.lowerMultiplier ?? 1) * 1e6), 16777619) >>> 0;
      }
    }
    if (densityAt && !heights) {
      const p = { x: 0, z: 0 };
      const width = plan!.parameters.width,
        depth = plan!.parameters.depth,
        invResMinus1 = 1 / (resolution - 1);
      const srcSamples = field.samples;
      for (let index = 0; index < srcSamples.length; index++) {
        if (index > 0 && index % (resolution * 16) === 0) yield;
        p.x = (index % resolution) * invResMinus1 * width;
        p.z = Math.floor(index / resolution) * invResMinus1 * depth;
        groundSamples[index] = Math.round(srcSamples[index] * densityAt(p).grass!);
      }
    }
    detailDensityFields.push({
      ...field,
      ...(grassDensity === undefined ? {} : { maximumDensityPerSquareMetre: grassDensity }),
      ...(heightRangeMetres ? { heightRangeMetres, candidateSeed: field.candidateSeed ?? field.hash, hash } : {}),
      samples: groundSamples
    });
  }
  return {
    ...population,
    treeInstances: [],
    treeSpeciesProfiles: [],
    detailSpeciesProfiles: population.detailSpeciesProfiles.filter((profile) => profile.category === "grass"),
    detailDensityFields
  };
}
