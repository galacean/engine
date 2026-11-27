import type { PlantFoliageVariation } from "../asset-assembly/PlantSpeciesCatalog";
import { vegetationRank } from "./VegetationRandom";

/** Exposure gain is independent of the regional tint and the Scene seasonal transform. */
export function vegetationFoliageBrightness(
  seed: number,
  speciesGroup: string,
  instanceId: string,
  region: { regionId: string; neighborRegionId: string; regionBlendWeight: number },
  rule: PlantFoliageVariation,
  role = "foliage"
): number {
  const sample = (range: readonly [number, number], key: string) =>
    range[0] + (range[1] - range[0]) * vegetationRank(seed, `${role}/${speciesGroup}/${key}`);
  const primary = sample(rule.regionExposureStops, region.regionId);
  const neighbor = sample(rule.regionExposureStops, region.neighborRegionId);
  const exposure =
    primary + (neighbor - primary) * region.regionBlendWeight + sample(rule.plantExposureStops, `plant/${instanceId}`);
  return 2 ** exposure;
}

export interface PlantColorSample {
  readonly brightness: number;
  readonly tint?: { readonly color: readonly [number, number, number]; readonly influence: number };
}
export interface PlantAppearanceSample {
  readonly foliage?: PlantColorSample;
  readonly bark?: PlantColorSample;
}
export function vegetationColorVariation(
  seed: number,
  speciesGroup: string,
  instanceId: string,
  region: { regionId: string; neighborRegionId: string; regionBlendWeight: number },
  rule: PlantFoliageVariation,
  role: "foliage" | "bark"
): PlantColorSample {
  const brightness = vegetationFoliageBrightness(seed, speciesGroup, instanceId, region, rule, role);
  if (!rule.regionalTint) return { brightness };
  const sample = (id: string) => vegetationRank(seed, `${role}/${speciesGroup}/${id}/tint`);
  const regional =
    sample(region.regionId) * (1 - region.regionBlendWeight) +
    sample(region.neighborRegionId) * region.regionBlendWeight;
  const t = regional + (sample(`plant/${instanceId}`) - regional) * (rule.regionalTint.plantInfluence ?? 0);
  const [a, b] = rule.regionalTint.colors;
  return {
    brightness,
    tint: {
      color: a.map((v, i) => v + (b[i] - v) * t) as [number, number, number],
      influence: rule.regionalTint.influence
    }
  };
}

/** Mix chromaticity at equal luminance, then apply exposure. Bark/foliage use separate catalog ranges. */
export function varyPlantColor(
  source: readonly [number, number, number],
  variation?: PlantColorSample
): readonly [number, number, number] {
  if (!variation) return source;
  const luminance = (rgb: readonly number[]) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const { tint } = variation;
  const scale = tint ? luminance(source) / luminance(tint.color) : 1;
  const colored = tint
    ? (source.map((v, i) => v + (tint.color[i] * scale - v) * tint.influence) as [number, number, number])
    : source;
  return varyFoliageColor(colored, variation.brightness);
}

/** Uniform gain preserves the source hue and saturation; limit gain at the RGB gamut boundary. */
export function varyFoliageColor(
  source: readonly [number, number, number],
  brightness: number
): readonly [number, number, number] {
  const gain = Math.min(brightness, 1 / Math.max(...source));
  return [source[0] * gain, source[1] * gain, source[2] * gain];
}
