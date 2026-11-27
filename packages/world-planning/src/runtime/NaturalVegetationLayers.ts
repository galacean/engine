import {
  applySpeciesMixtureWeights,
  sampleSpeciesGroupWeights,
  type SpeciesRegionSettings
} from "@galacean/engine-vegetation/world/VegetationSpeciesRegions";
import type { VegetationCompanionRecipe } from "@galacean/engine-vegetation/world/VegetationCompanionPatches";
import {
  type LandscapeLayerRule,
  type LandscapePlantAsset
} from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import { VEGETATION_AUTHORING_REFERENCE_SCALE } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblyRenderProfile";
import recipe from "../planning-data/natural-vegetation.json";
import {
  PLANT_SPECIES,
  PLANT_SPECIES_PALETTES,
  PLANT_FOLIAGE_VARIATIONS,
  PLANT_BARK_VARIATIONS
} from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import {
  LANDSCAPE_GRASS_COVERAGE,
  landscapeGrassPaletteArea
} from "../integrations/vegetation/VegetationLandscapeGrass.ts";

/** Rules consumed by fixed native candidates; preview-only packing and composition stay in Asset Assembly. */
export type NaturalVegetationLayerRule = Pick<
  LandscapeLayerRule,
  | "id"
  | "palette"
  | "density"
  | "scale"
  | "clusterRadius"
  | "clusterStrength"
  | "footprintRatio"
  | "maxSlopeDegrees"
  | "speciesRegions"
> & {
  readonly companionPlanting?: Omit<NonNullable<LandscapeLayerRule["companionPlanting"]>, "densityMultiplier"> & {
    readonly densityMultiplier?: number;
  };
};

/** Authored world-metre territories; independent of density patches and render cells. */
export function naturalVegetationSpeciesRegions(layerKey: string): SpeciesRegionSettings {
  const layer = recipe.layers.find((layer) => layer.key === layerKey);
  if (!layer) throw new Error(`Unknown vegetation layer: ${layerKey}`);
  return {
    ...recipe.defaults.speciesRegions,
    ...("speciesRegions" in layer.rule ? layer.rule.speciesRegions : {}),
    scopeId: layerKey
  };
}
const speciesGroups = new Map(PLANT_SPECIES.map((entry) => [entry.id, entry.vegetation.speciesGroup ?? entry.id]));
const mixtureGroups = new Map(PLANT_SPECIES.map((entry) => [entry.id, entry.vegetation.mixtureGroup]));

export const NATURAL_VEGETATION_PALETTES = PLANT_SPECIES_PALETTES;
export const NATURAL_VEGETATION_COMPANION_PATCHES = recipe.companionPatches as unknown as VegetationCompanionRecipe;
/** Work is budgeted in authored world area, independently of replacement renderer mesh dimensions. */
const referenceHeight =
  PLANT_SPECIES.find((entry) => entry.id === recipe.referenceTree)!.vegetation.sourceDimensionsM![1] *
  VEGETATION_AUTHORING_REFERENCE_SCALE;
const referenceArea = (referenceHeight * recipe.referenceAreaSideInTreeHeights) ** 2;
export function naturalVegetationSamplingBudget(areaM2: number) {
  return {
    candidates: Math.ceil((recipe.samplingBudgetPerReferenceArea.candidates * areaM2) / referenceArea),
    instances: Math.ceil((recipe.samplingBudgetPerReferenceArea.instances * areaM2) / referenceArea)
  };
}
export const NATURAL_VEGETATION_ASSET_IDS = new Set(Object.values(NATURAL_VEGETATION_PALETTES).flat());
export const SEED_WORLD_NATURAL_VEGETATION_EXCLUDED_ASSET_IDS = new Set(
  PLANT_SPECIES.filter((entry) => entry.vegetation.seedWorld === false).map((entry) => entry.id)
);
export const SEED_WORLD_NATURAL_VEGETATION_ASSET_IDS = new Set(
  [...NATURAL_VEGETATION_ASSET_IDS].filter((id) => !SEED_WORLD_NATURAL_VEGETATION_EXCLUDED_ASSET_IDS.has(id))
);

/** A population layer can contain several asset categories, and a category can occur in several layers. */
export const NATURAL_VEGETATION_LAYER_MEMBERS = recipe.layers.map((layer) => {
  const assets = PLANT_SPECIES.filter(
    (asset) =>
      SEED_WORLD_NATURAL_VEGETATION_ASSET_IDS.has(asset.id) &&
      NATURAL_VEGETATION_PALETTES[layer.key as keyof typeof NATURAL_VEGETATION_PALETTES].includes(asset.id)
  );
  return {
    key: layer.key,
    label: layer.id,
    categories: [...new Set(assets.map((asset) => asset.category))],
    families: [...new Set(assets.flatMap((asset) => ("family" in asset && asset.family ? [asset.family] : [])))]
  };
});

export function vegetationAssetCategories(assetIds: readonly string[]): string[] {
  const ids = new Set(assetIds);
  return [...new Set(PLANT_SPECIES.filter((asset) => ids.has(asset.id)).map((asset) => asset.category))];
}

/** One growth range per functional layer; trees and the grass carpet keep their existing height owners. */
export const NATURAL_VEGETATION_SIZE_CONTROLS = recipe.layers
  .filter((layer) => layer.key !== "trees" && layer.key !== "grass")
  .map((layer) => ({
    key: layer.key,
    label: layer.id,
    scale: (layer.rule.scale ?? recipe.defaults.scale) as readonly number[],
    assetIds: NATURAL_VEGETATION_PALETTES[layer.key as keyof typeof NATURAL_VEGETATION_PALETTES].filter((id) =>
      SEED_WORLD_NATURAL_VEGETATION_ASSET_IDS.has(id)
    )
  }));
const sizeControls = new Map(NATURAL_VEGETATION_SIZE_CONTROLS.map((control) => [control.key, control]));
const legacySizeControls = new Map(
  NATURAL_VEGETATION_SIZE_CONTROLS.flatMap((control) => control.assetIds.map((assetId) => [assetId, control] as const))
);
/** Layer-keyed author ranges. Asset-ID keys are read compatibility for older saved projects only. */
export type NaturalVegetationSizeOverrides = Readonly<Record<string, { scaleMin?: number; scaleMax?: number }>>;
export type NaturalVegetationSizes = Readonly<Record<string, readonly [number, number]>>;

/** Resolve sparse layer ranges without expanding them into per-species parameters.
 * @param overrides Authored functional-layer ranges or legacy saved species ranges.
 * @returns Only authored ranges, with missing endpoints supplied by the unchanged layer recipe.
 * @throws If a key is unknown or its range is nonfinite, nonpositive or reversed.
 */
export function resolveNaturalVegetationSizes(overrides: NaturalVegetationSizeOverrides = {}): NaturalVegetationSizes {
  const result: Record<string, readonly [number, number]> = {};
  for (const [key, value] of Object.entries(overrides)) {
    const source = sizeControls.get(key) ?? legacySizeControls.get(key);
    if (!source || Object.keys(value).some((key) => key !== "scaleMin" && key !== "scaleMax"))
      throw new Error(`Unknown natural vegetation size: ${key}`);
    const range = [value.scaleMin ?? source.scale[0], value.scaleMax ?? source.scale[1]] as const;
    if (!range.every((v) => Number.isFinite(v) && v > 0) || range[0] > range[1])
      throw new Error(`植株尺度须为正数且下限不超过上限：${key}`);
    if (value.scaleMin !== undefined || value.scaleMax !== undefined) result[key] = range;
  }
  return result;
}

/** Shared authored recipe. Normalized spatial values use the measured reference tree height. */
export function createNaturalVegetationLayers(
  assets: readonly LandscapePlantAsset[],
  excludedAssetIds?: ReadonlySet<string>,
  seed?: number,
  sizes: NaturalVegetationSizes = {}
): readonly NaturalVegetationLayerRule[] {
  const tree = assets.find((asset) => asset.id === recipe.referenceTree);
  if (!tree) throw new Error("Natural vegetation reference tree is missing from the species catalog");
  const unit = tree.height,
    area = (unit * recipe.referenceAreaSideInTreeHeights) ** 2;
  return recipe.layers.flatMap((source) => {
    const sharedScale = sizes[source.key];
    const rule = {
      ...recipe.defaults,
      ...source.rule,
      ...(sharedScale ? { scale: sharedScale } : {})
    } as unknown as Omit<NaturalVegetationLayerRule, "id" | "palette" | "density">;
    const ids = NATURAL_VEGETATION_PALETTES[source.key as keyof typeof NATURAL_VEGETATION_PALETTES].filter(
      (assetId) => !excludedAssetIds?.has(assetId)
    );
    if (!ids.length) return [];
    const members = ids.map((assetId) => ({
      assetId,
      speciesGroup: speciesGroups.get(assetId)!,
      ...(mixtureGroups.get(assetId) === undefined ? {} : { mixtureGroup: mixtureGroups.get(assetId) })
    }));
    const weights = sampleSpeciesGroupWeights(seed ?? 0, source.key, members);
    const speciesRegions = naturalVegetationSpeciesRegions(source.key);
    const palette = applySpeciesMixtureWeights(
      members.map((member) => ({
        ...member,
        weight: weights[member.assetId],
        foliageVariation: PLANT_FOLIAGE_VARIATIONS.get(member.assetId),
        barkVariation: PLANT_BARK_VARIATIONS.get(member.assetId),
        // A shared layer range supersedes old saved species ranges as a whole.
        ...(!sharedScale && sizes[member.assetId] ? { scale: sizes[member.assetId] } : {})
      })),
      speciesRegions.localMixture
    );
    const grass = source.key === "grass";
    const companionCoverage =
      source.rule.companionPlanting && "coverage" in source.rule.companionPlanting
        ? source.rule.companionPlanting.coverage
        : undefined;
    const footprint = grass ? landscapeGrassPaletteArea(palette, rule.scale, assets) : 1;
    return {
      ...rule,
      id: source.id,
      palette,
      speciesRegions,
      ...(rule.companionPlanting
        ? {
            companionPlanting: {
              ...rule.companionPlanting,
              patches: NATURAL_VEGETATION_COMPANION_PATCHES,
              ...(companionCoverage === undefined
                ? {}
                : {
                    densityPerM2:
                      -Math.log(1 - companionCoverage) / landscapeGrassPaletteArea(palette, rule.scale, assets)
                  })
            }
          }
        : {}),
      density: grass ? -Math.log(1 - LANDSCAPE_GRASS_COVERAGE) / footprint : source.countPerReferenceArea / area,
      clusterRadius: rule.clusterRadius * unit
    };
  });
}

/** Stone variants come directly from the loaded source family, with its measured metre bounds. */
export function createNaturalCompanionStoneLayer(
  assets: readonly LandscapePlantAsset[]
): NaturalVegetationLayerRule | undefined {
  if (!assets.length) return undefined;
  const palette = [...assets]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((asset) => ({ assetId: asset.id, weight: 1 }));
  const scale = recipe.companionStones.scale as [number, number];
  const density = -Math.log(1 - recipe.companionStones.coverage) / landscapeGrassPaletteArea(palette, scale, assets);
  return {
    id: "树脚石块",
    palette,
    density,
    scale,
    clusterRadius: Math.sqrt(landscapeGrassPaletteArea(palette, scale, assets) / Math.PI),
    clusterStrength: 0,
    maxSlopeDegrees: recipe.defaults.maxSlopeDegrees,
    companionPlanting: {
      patches: { ...NATURAL_VEGETATION_COMPANION_PATCHES, anchorLayers: ["乔木"] },
      strength: 1,
      densityPerM2: density
    }
  };
}
