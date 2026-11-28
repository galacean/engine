import library from "@galacean/engine-vegetation/asset-assembly/generated/procedural-trees/plant-species.json";
import materials from "@galacean/engine-vegetation/asset-assembly/generated/procedural-trees/meadow-plant-materials.json";
import { sampleSpeciesGroupWeights } from "@galacean/engine-vegetation/world/VegetationSpeciesRegions";
import { PLANT_SPECIES } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";

/** Existing authored flower variants keep their prototype, dimensions and exact appearance slots. */
export const FLOWER_ASSET_VARIANTS = library.assets
  .filter((entry) => entry.category === "Flowers" && entry.parameterFile)
  .map((entry) => {
    const slots = materials.assets[entry.id as keyof typeof materials.assets];
    if (!slots) throw new Error(`原生花资产缺少材质槽：${entry.id}`);
    return {
      id: entry.id,
      label: `${entry.displayName ?? entry.id} (${entry.id})`,
      prototypeId: entry.prototypeId ?? entry.id,
      speciesGroup: PLANT_SPECIES.find((species) => species.id === entry.id)!.vegetation.speciesGroup ?? entry.id,
      defaultWeight: 1,
      petals: Object.entries(slots)
        .filter(([, binding]) => binding.role === "flower" && !("component" in binding))
        .map(([id, binding]) => ({ id, baseColor: binding.baseColor as readonly number[] }))
    };
  });
const variantsById = new Map(FLOWER_ASSET_VARIANTS.map((entry) => [entry.id, entry]));
export type FlowerAssetWeights = Readonly<Record<string, number>>;

/** Neutral catalog prior for discovery and explicit authoring without a generation scope. */
export function resolveFlowerAssetWeights(...sources: (FlowerAssetWeights | undefined)[]): Record<string, number> {
  const result = Object.fromEntries(FLOWER_ASSET_VARIANTS.map((entry) => [entry.id, entry.defaultWeight]));
  for (const source of sources)
    if (source)
      for (const [id, value] of Object.entries(source)) {
        if (!variantsById.has(id) || !Number.isFinite(value) || value < 0 || value > 1)
          throw new Error(`原生花资产权重无效：${id}`);
        result[id] = value;
      }
  return result;
}

/** Unedited species follow the world's regional sampler; sparse authored fields override it. */
export function resolveGeneratedFlowerAssetWeights(
  seed: number,
  scopeId: string,
  ...sources: (FlowerAssetWeights | undefined)[]
): Record<string, number> {
  return resolveFlowerAssetWeights(
    sampleSpeciesGroupWeights(
      seed,
      `flowers:${scopeId}`,
      FLOWER_ASSET_VARIANTS.map((asset) => ({ assetId: asset.id, speciesGroup: asset.speciesGroup }))
    ),
    ...sources
  );
}

export function flowerAssetMembers(weights?: FlowerAssetWeights): { assetId: string; weight: number }[] {
  return Object.entries(resolveFlowerAssetWeights(weights))
    .filter(([, weight]) => weight > 0)
    .map(([assetId, weight]) => ({ assetId, weight }));
}

/** Resources follow effective catalog weights; no fixed default flower pair is added. */
export function flowerAssetResourceIds(configs: readonly { assetWeights?: FlowerAssetWeights }[]): Set<string> {
  return new Set(configs.flatMap((config) => flowerAssetMembers(config.assetWeights).map((member) => member.assetId)));
}
