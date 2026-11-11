import recipe from "./natural-vegetation.json";
import { PLANT_TREE_SPECIES } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";
import type { LandscapeConfig } from "../semantic-study/ContextLandscape";
import type { SemanticEdit } from "../semantic-study/WorldPlanningContract";
import { resolveParameters } from "../semantic-study/ParameterScopes";
import { territoryLookup } from "../spatial/ecology/PoiTerritories";
import {
  createVegetationSpeciesRegions,
  sampleSpeciesGroupWeights
} from "@galacean/engine-vegetation/world/VegetationSpeciesRegions";
import {
  resolveNaturalVegetationSizes,
  naturalVegetationSpeciesRegions,
  type NaturalVegetationSizes
} from "../runtime/NaturalVegetationLayers.ts";

export const NATURAL_VEGETATION_CONTROLS = recipe.layers.map(({ key, id, density }) => ({ key, label: id, density }));
export type NaturalVegetationDensity = Partial<Record<string, number>>;
export const NATURAL_VEGETATION_DEFAULTS = recipe.planning;
export const NATURAL_VEGETATION_EDGE_LAYERS = recipe.edgePlantingLayers.map(
  (key) => recipe.layers.find((layer) => layer.key === key)!.id
);
export type NaturalVegetationSettings = typeof NATURAL_VEGETATION_DEFAULTS;
export interface NaturalVegetationDistribution {
  world: NaturalVegetationDensity;
  regions: Record<string, NaturalVegetationDensity>;
  /** World-scoped height and boundary planting parameters; independent of regional layer abundance. */
  settings: NaturalVegetationSettings;
  /** Shared world layer ranges; absent layers retain their native recipe ranges. */
  plantSizes?: NaturalVegetationSizes;
}
export function naturalVegetationDensity(values: NaturalVegetationDensity = {}): NaturalVegetationDensity {
  const result = Object.fromEntries(recipe.layers.map((layer) => [layer.key, values[layer.key] ?? layer.density]));
  if (Object.values(result).some((v) => !Number.isFinite(v) || v < 0 || v > 1))
    throw new Error("自然植被密度比例须在 0–100% 之间");
  return result;
}
/** Compile inherited authoring values once; runtimes only consume this published projection. */
export function publishNaturalVegetation(
  plan: IslandPlan,
  config?: LandscapeConfig,
  edits: Record<string, SemanticEdit> = {}
): NaturalVegetationDistribution {
  const settings = Object.fromEntries(
    Object.entries(NATURAL_VEGETATION_DEFAULTS).map(([key, value]) => [
      key,
      config?.[key as keyof NaturalVegetationSettings] ?? value
    ])
  ) as NaturalVegetationSettings;
  if (
    Object.values(settings).some((value) => !Number.isFinite(value) || value < 0) ||
    settings.grassRelativeHeight <= 0 ||
    settings.grassRelativeHeight > 1 ||
    settings.grassHeightVariation >= 1 ||
    settings.roadsideGrassHeightRatio <= 0 ||
    settings.roadsideGrassHeightRatio > 1
  )
    throw new Error("低草高度比例须在0–1之间且大于0，高度变化须小于1，伴生带宽度和倍率须为非负数");
  const regions = (plan.poiDistribution?.sites ?? [])
    .filter((site) => site.active)
    .map((site) => {
      const q = resolveParameters<Partial<LandscapeConfig>>(
        config ?? {},
        edits[site.domainId]?.landscape,
        edits[site.id]?.landscape
      );
      return { id: site.id, density: naturalVegetationDensity(q.vegetation) };
    });
  return {
    world: naturalVegetationDensity(config?.vegetation),
    regions: Object.fromEntries(regions.map((q) => [q.id, q.density])),
    settings,
    plantSizes: resolveNaturalVegetationSizes(config?.plantSizes)
  };
}
export function naturalVegetationAt(plan: IslandPlan): (point: PlanPoint) => NaturalVegetationDensity {
  const distribution = plan.naturalVegetation ?? publishNaturalVegetation(plan),
    world = distribution.world;
  if (Object.values(distribution.regions).every((q) => JSON.stringify(q) === JSON.stringify(world))) return () => world;
  const territory = territoryLookup(plan);
  return (point) => distribution.regions[territory(point)[0]?.site.id] ?? world;
}
/** Ecology chooses the species by world position before computing its proportional footprint. */
export function createNaturalTreeSpeciesRegions(seed: number) {
  const weights = sampleSpeciesGroupWeights(seed, "trees", PLANT_TREE_SPECIES);
  return createVegetationSpeciesRegions(
    seed,
    PLANT_TREE_SPECIES.map((species) => ({ ...species, weight: weights[species.assetId] })),
    naturalVegetationSpeciesRegions("trees")
  );
}
export function createNaturalTreeDimensions(seed: number) {
  const speciesAt = createNaturalTreeSpeciesRegions(seed);
  return (id: string, height: number, point: PlanPoint) => {
    const selected = speciesAt([point.x, point.z], id).member;
    const [width, sourceHeight, depth] = selected.sourceDimensionsM;
    if (![height, width, sourceHeight, depth].every((v) => Number.isFinite(v) && v > 0))
      throw new Error("Invalid natural tree dimensions");
    return {
      assetId: selected.assetId,
      width: (height * width) / sourceHeight,
      depth: (height * depth) / sourceHeight,
      height
    };
  };
}
export function naturalTreeDimensions(seed: number, id: string, height: number, point: PlanPoint) {
  return createNaturalTreeDimensions(seed)(id, height, point);
}
