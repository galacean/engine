import type {
  LandscapeLayerRule,
  LandscapePlantAsset,
  VegetationLandscapeRequest
} from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import {
  getSeedWorldAssetPlacementProfile,
  SEED_WORLD_GRASS_SCALE_RANGE_DEFAULT,
  DETAIL_HORIZONTAL_SCALE_VARIATION_MINIMUM,
  DETAIL_HORIZONTAL_SCALE_VARIATION_MAXIMUM
} from "../../world/SeedWorldAssetPlacementProfile.ts";

export const LANDSCAPE_CARD_GRASS_IDS = ["SM_Grass_01_01", "SM_Grass_01_02", "SM_Grass_01_03"] as const;
export const LANDSCAPE_GRASS_LAYER = "低草铺底";
export const LANDSCAPE_GRASS_COVERAGE = 0.995;
export const LANDSCAPE_GRASS_MINIMUM_COVERAGE = 0.98;
export type LandscapeGrassMode = "mixed" | "cards" | "mesh";

/** Expected authored clump envelope, including correlated growth and independent horizontal jitter.
 * This is a planting overlap estimate, not an opaque-pixel or screenshot coverage claim. */
export function landscapeGrassPaletteArea(
  palette: LandscapeLayerRule["palette"],
  scale: LandscapeLayerRule["scale"],
  assets: readonly LandscapePlantAsset[]
): number {
  let area = 0,
    weight = 0;
  for (const member of palette) {
    const asset = assets.find((asset) => asset.id === member.assetId);
    if (!asset || !(asset.radius > 0)) throw new Error(`Missing grass dimensions: ${member.assetId}`);
    const [lo, hi] = member.scale ?? scale;
    const meanSquare = (lo * lo + lo * hi + hi * hi) / 3;
    const [axisLo, axisHi] = member.horizontalVariation ?? [1, 1];
    const meanAxis = (axisLo + axisHi) / 2;
    area += member.weight * (asset.footprintArea ?? Math.PI * asset.radius ** 2) * meanSquare * meanAxis ** 2;
    weight += member.weight;
  }
  if (!(weight > 0) || !(area > 0)) throw new Error("Invalid grass footprint area");
  return area / weight;
}

/** Rendering assets supply shape and appearance; the regional ground-cover recipe owns density.
 * Preserve expected coverage (and user density edits) when changing grass representation. */
export function withLandscapeGrassMode(
  request: VegetationLandscapeRequest,
  mode: LandscapeGrassMode,
  assets: readonly LandscapePlantAsset[],
  meshAssetId: string
): VegetationLandscapeRequest {
  if (!["mixed", "cards", "mesh"].includes(mode)) throw new Error("Unknown grass representation");
  const result = structuredClone(request);
  const index = result.layers.findIndex((layer) => layer.id === LANDSCAPE_GRASS_LAYER);
  if (index < 0) throw new Error("环境输入缺少低草铺底层");
  const layer = result.layers[index];
  for (const id of [...LANDSCAPE_CARD_GRASS_IDS, meshAssetId]) {
    const asset = assets.find((asset) => asset.id === id);
    if (!asset || !(asset.radius > 0)) throw new Error(`Missing grass dimensions: ${id}`);
  }
  const meshShare = mode === "mixed" ? 0.5 : mode === "mesh" ? 1 : 0;
  const horizontal = getSeedWorldAssetPlacementProfile("grass").roleScale.field!;
  const vertical = SEED_WORLD_GRASS_SCALE_RANGE_DEFAULT;
  const cardPalette = LANDSCAPE_CARD_GRASS_IDS.map((assetId) => ({ assetId, weight: 1 }));
  const meshMember = {
    assetId: meshAssetId,
    weight: 1,
    scale: [horizontal.minimum, horizontal.maximum] as const,
    heightScale: [vertical.minimum, vertical.maximum] as const,
    horizontalVariation: [DETAIL_HORIZONTAL_SCALE_VARIATION_MINIMUM, DETAIL_HORIZONTAL_SCALE_VARIATION_MAXIMUM] as const
  };
  const cardArea = landscapeGrassPaletteArea(cardPalette, layer.scale, assets);
  const meshArea = landscapeGrassPaletteArea([meshMember], layer.scale, assets);
  // Share coverage, not instance counts: differently sized clumps contribute different areas.
  const palette: typeof layer.palette = [
    ...cardPalette.map((member) => ({ ...member, weight: (1 - meshShare) / cardArea / cardPalette.length })),
    { ...meshMember, weight: meshShare / meshArea }
  ].filter((member) => member.weight > 0);
  const densityRatio =
    landscapeGrassPaletteArea(layer.palette, layer.scale, assets) /
    landscapeGrassPaletteArea(palette, layer.scale, assets);
  return {
    ...result,
    layers: result.layers.map((entry, i) =>
      i === index
        ? {
            ...layer,
            palette,
            density: layer.density * densityRatio,
            ...(layer.minimumDensity === undefined ? {} : { minimumDensity: layer.minimumDensity * densityRatio })
          }
        : entry
    )
  };
}
