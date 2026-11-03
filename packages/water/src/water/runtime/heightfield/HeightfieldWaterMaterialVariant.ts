import { WaterSurfaceDepthSource } from "../../authoring/surface/enums/WaterSurfaceDepthSource";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WATER_WAVE_SHADER_SLOT_COUNTS } from "../../authoring/wave/constants/WaterWaveLimits";
import { createWaterMaterialVariant, type WaterMaterialVariant } from "../material/WaterMaterialVariant";

export interface HeightfieldWaterMaterialVariantResolution {
  readonly variant: WaterMaterialVariant;
  readonly shaderName: string;
  readonly waveSlotCount: number;
  readonly surfaceAppearanceVersion: 2;
  readonly localSpatialFields: boolean;
  readonly cameraDepth: boolean;
}

export function resolveHeightfieldWaterMaterialVariant(
  quality: WaterQualityTier,
  depthSource: WaterSurfaceDepthSource,
  appearanceVariantKey: `surface-appearance-v2:${string}`,
  waveSlotCount: number
): HeightfieldWaterMaterialVariantResolution {
  if (!appearanceVariantKey) {
    throw new Error("Heightfield Surface Appearance V2 requires a structural appearance variant key.");
  }
  // The physical compiler owns wave capacity; geometry/shading tiers cannot
  // truncate a physical surface or select a different set of wave uniforms.
  if (waveSlotCount !== 0 && !WATER_WAVE_SHADER_SLOT_COUNTS.some((count) => count === waveSlotCount)) {
    throw new RangeError(`Unsupported compiled Heightfield wave capacity: ${waveSlotCount}.`);
  }
  const depthSourceName =
    depthSource === WaterSurfaceDepthSource.LocalBathymetry
      ? "LocalBathymetry"
      : depthSource === WaterSurfaceDepthSource.HybridOptionalSceneDepth
        ? "Hybrid"
        : "SceneDepth";
  const qualityName = quality[0].toUpperCase() + quality.slice(1);
  const variant = createWaterMaterialVariant("heightfield", {
    appearanceVariantKey,
    depthSource,
    quality,
    surfaceAppearance: true,
    surfaceAppearanceVersion: 2,
    waveSlotCount
  });
  const v2Suffix = appearanceVariantKey?.slice("surface-appearance-v2:".length) ?? "";
  return Object.freeze({
    variant,
    shaderName: `AIWorld/HeightfieldWaterSurfaceAppearanceV2${v2Suffix}${
      depthSourceName === "SceneDepth" ? "" : depthSourceName
    }${qualityName}${waveSlotCount}`,
    waveSlotCount,
    surfaceAppearanceVersion: 2,
    localSpatialFields: depthSource !== WaterSurfaceDepthSource.SceneDepth,
    cameraDepth: depthSource !== WaterSurfaceDepthSource.LocalBathymetry
  });
}
