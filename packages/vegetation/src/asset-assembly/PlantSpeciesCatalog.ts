import catalog from "./generated/procedural-trees/plant-species.json";
import materials from "./generated/procedural-trees/meadow-plant-materials.json";
import type { ProceduralPlantLibraryEntry } from "./ProceduralPlantAsset";

export type PlantVegetationLayer = "trees" | "shrubs" | "grass" | "herbs" | "cover" | "flowers" | "litter";
export interface PlantFoliageVariation {
  readonly regionExposureStops: readonly [number, number];
  readonly plantExposureStops: readonly [number, number];
  readonly regionalTint?: {
    readonly colors: readonly [readonly [number, number, number], readonly [number, number, number]];
    readonly influence: number;
    /** Share of the tint position sampled per plant; the rest follows the species region. */
    readonly plantInfluence?: number;
  };
}
export interface PlantSpeciesEntry extends ProceduralPlantLibraryEntry {
  readonly vegetation: {
    readonly layer: PlantVegetationLayer;
    /** Model variants with this shared identity occupy the same species regions. Omitted: own group. */
    readonly speciesGroup?: string;
    /** Authored growth form for local mixtures, independent of species identity and variant count. */
    readonly mixtureGroup?: string;
    /** Planting plane in source-local metres; omission keeps the geometric-bottom convention. */
    readonly plantingHeightM?: number;
    /** Optional species-specific ranges; otherwise inherit the catalog's shared foliage rule. */
    readonly foliageVariation?: PlantFoliageVariation;
    readonly barkVariation?: PlantFoliageVariation;
    /** Explicit user exclusion; exhibition availability is independent. */
    readonly seedWorld?: boolean;
    /** Measured LOD0 dimensions, refreshed by sync-plant-species.mjs. */
    readonly sourceDimensionsM?: readonly [number, number, number];
  };
}

/** One disk index for exhibition, planning and runtime resources. No name-based species discovery. */
export const PLANT_SPECIES_CATALOG = catalog;
export const PLANT_SPECIES: readonly PlantSpeciesEntry[] = [
  ...catalog.assets,
  ...catalog.treeRecipes,
  ...catalog.shrubRecipes
] as unknown as readonly PlantSpeciesEntry[];

function validateFoliageVariation(rule: PlantFoliageVariation): PlantFoliageVariation {
  for (const range of [rule.regionExposureStops, rule.plantExposureStops])
    if (
      !range ||
      range.length !== 2 ||
      !range.every((value) => Number.isFinite(value) && Number.isFinite(2 ** value) && 2 ** value > 0) ||
      range[0] > range[1]
    )
      throw new Error("Invalid catalog foliage exposure range");
  if (
    [0, 1].some((index) => {
      const gain = 2 ** (rule.regionExposureStops[index] + rule.plantExposureStops[index]);
      return !Number.isFinite(gain) || gain <= 0;
    })
  )
    throw new Error("Catalog foliage exposure produces invalid brightness");
  if (
    rule.regionalTint &&
    (!(rule.regionalTint.influence >= 0 && rule.regionalTint.influence <= 1) ||
      (rule.regionalTint.plantInfluence !== undefined &&
        !(rule.regionalTint.plantInfluence >= 0 && rule.regionalTint.plantInfluence <= 1)) ||
      rule.regionalTint.colors.length !== 2 ||
      rule.regionalTint.colors.some(
        (color) =>
          color.length !== 3 || !color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) || !color.some((v) => v > 0)
      ))
  )
    throw new Error("Invalid catalog regional material tint");
  return rule;
}
const defaultFoliageVariation = validateFoliageVariation(catalog.foliageVariation as unknown as PlantFoliageVariation);
const defaultBarkVariation = validateFoliageVariation(catalog.barkVariation as unknown as PlantFoliageVariation);

export function plantSpeciesPalettes(entries: readonly PlantSpeciesEntry[] = PLANT_SPECIES) {
  const palettes: Record<PlantVegetationLayer, string[]> = {
    trees: [],
    shrubs: [],
    grass: [],
    herbs: [],
    cover: [],
    flowers: [],
    litter: []
  };
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate plant species: ${entry.id}`);
    ids.add(entry.id);
    if (entry.vegetation?.speciesGroup !== undefined && !entry.vegetation.speciesGroup.trim())
      throw new Error(`Empty plant species group: ${entry.id}`);
    if (entry.vegetation?.mixtureGroup !== undefined && !entry.vegetation.mixtureGroup.trim())
      throw new Error(`Empty plant mixture group: ${entry.id}`);
    if (entry.vegetation?.plantingHeightM !== undefined && !Number.isFinite(entry.vegetation.plantingHeightM))
      throw new Error(`Invalid plant planting height: ${entry.id}`);
    if (!entry.parameterFile || !palettes[entry.vegetation?.layer])
      throw new Error(`Plant species needs resources and a vegetation layer: ${entry.id}`);
    palettes[entry.vegetation.layer].push(entry.id);
  }
  return palettes;
}

export const PLANT_SPECIES_PALETTES = plantSpeciesPalettes();
interface SpeciesMaterial {
  readonly role: string;
  readonly baseColor: readonly number[];
  readonly component?: string;
}
/** Native recipe authoring slots retain their original multiplier semantics. Population adapters separate
 * the source colour into renderer data before applying the same variation as library assets.
 * Format-specific materials expose the same native authoring slots without another species registration. */
export const PLANT_SPECIES_MATERIALS: Readonly<Record<string, Readonly<Record<string, SpeciesMaterial>>>> = {
  ...materials.assets,
  ...Object.fromEntries(
    catalog.treeRecipes.map((entry) => [
      entry.id,
      {
        bark: { role: "bark", baseColor: [1, 1, 1] },
        leaf: { role: "leaf", baseColor: [1, 1, 1] }
      }
    ])
  ),
  ...Object.fromEntries(
    catalog.shrubRecipes.map((entry) => [
      entry.id,
      Object.fromEntries(Object.keys(entry.materialFiles).map((id) => [id, { role: "shrub", baseColor: [1, 1, 1] }]))
    ])
  )
};
/** Ground cover follows the live grass field, with one bounded, seeded brightness offset per species. */
const groundCoverBrightness = catalog.groundCoverVariation.brightness as [number, number];
if (
  groundCoverBrightness.length !== 2 ||
  !groundCoverBrightness.every((value) => Number.isFinite(value) && value > 0) ||
  groundCoverBrightness[0] > 1 ||
  groundCoverBrightness[1] < 1
)
  throw new Error("Invalid catalog ground cover brightness range");
export const PLANT_GROUND_COVER_VARIATIONS: ReadonlyMap<string, readonly [number, number]> = new Map(
  PLANT_SPECIES.filter((entry) => entry.vegetation.layer === "cover").map((entry) => [entry.id, groundCoverBrightness])
);
/** Only actual foliage slots receive this rule; ground cover, grass, petals and fungi retain their own colour sources. */
export const PLANT_FOLIAGE_VARIATIONS: ReadonlyMap<string, PlantFoliageVariation> = new Map(
  PLANT_SPECIES.filter(
    (entry) =>
      entry.vegetation.layer !== "cover" &&
      Object.values(PLANT_SPECIES_MATERIALS[entry.id] ?? {}).some(
        (slot) => slot.role === "leaf" || slot.role === "shrub"
      )
  ).map((entry) => [
    entry.id,
    entry.vegetation.foliageVariation
      ? validateFoliageVariation(entry.vegetation.foliageVariation)
      : defaultFoliageVariation
  ])
);
export const PLANT_BARK_VARIATIONS: ReadonlyMap<string, PlantFoliageVariation> = new Map(
  PLANT_SPECIES.filter((entry) =>
    Object.values(PLANT_SPECIES_MATERIALS[entry.id] ?? {}).some((slot) => slot.role === "bark")
  ).map((entry) => [
    entry.id,
    entry.vegetation.barkVariation ? validateFoliageVariation(entry.vegetation.barkVariation) : defaultBarkVariation
  ])
);
export const PLANT_TREE_SPECIES = PLANT_SPECIES.filter(
  (entry) => entry.vegetation.layer === "trees" && entry.vegetation.seedWorld !== false
).map((entry) => {
  const dimensions = entry.vegetation.sourceDimensionsM;
  if (!dimensions || dimensions.length !== 3 || !dimensions.every((value) => Number.isFinite(value) && value > 0))
    throw new Error(`Refresh plant species dimensions: ${entry.id}`);
  return { assetId: entry.id, speciesGroup: entry.vegetation.speciesGroup ?? entry.id, sourceDimensionsM: dimensions };
});
