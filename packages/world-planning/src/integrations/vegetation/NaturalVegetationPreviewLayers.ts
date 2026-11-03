import {
  createNaturalVegetationLayers,
  NATURAL_VEGETATION_COMPANION_PATCHES
} from "../../runtime/NaturalVegetationLayers.ts";
import type {
  LandscapeLayerRule,
  LandscapePlantAsset
} from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import { LANDSCAPE_GRASS_MINIMUM_COVERAGE, landscapeGrassPaletteArea } from "./VegetationLandscapeGrass.ts";
import nativeRecipe from "../../planning-data/natural-vegetation.json";
import previewRecipe from "@galacean/engine-vegetation/asset-assembly/vegetation-landscape-preview.json";

/** Preserve the independent composition preview while Seed uses only fixed-candidate rules.
 * Shared species, sizes and density still come from the native recipe; packing,
 * depth thinning and elliptical clusters belong exclusively to this preview.
 */
export function createNaturalVegetationPreviewLayers(
  assets: readonly LandscapePlantAsset[],
  seed: number
): readonly LandscapeLayerRule[] {
  const unit = assets.find((asset) => asset.id === nativeRecipe.referenceTree)!.height;
  const overrides = previewRecipe.layers as unknown as Record<string, Partial<LandscapeLayerRule>>;
  return createNaturalVegetationLayers(assets, undefined, seed).map((layer) => {
    const extra = overrides[layer.id] ?? {};
    const companion =
      layer.companionPlanting || extra.companionPlanting
        ? { ...layer.companionPlanting, ...extra.companionPlanting, patches: NATURAL_VEGETATION_COMPANION_PATCHES }
        : undefined;
    return {
      ...previewRecipe.defaults,
      ...layer,
      ...extra,
      ...(companion ? { companionPlanting: companion } : {}),
      ...(extra.clusterRadius === undefined ? {} : { clusterRadius: extra.clusterRadius * unit }),
      ...(extra.edgeGrowth ? { edgeGrowth: { ...extra.edgeGrowth, width: extra.edgeGrowth.width * unit } } : {}),
      ...(layer.id === nativeRecipe.layers.find((source) => source.key === "grass")!.id
        ? {
            minimumDensity:
              -Math.log(1 - LANDSCAPE_GRASS_MINIMUM_COVERAGE) /
              landscapeGrassPaletteArea(layer.palette, layer.scale, assets)
          }
        : {})
    } as LandscapeLayerRule;
  });
}
