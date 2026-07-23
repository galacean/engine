/** Pure reflection-sampling validation shared by the Heightfield material and runtime readback. */
import type { Matrix } from "@galacean/engine-math";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import {
  DEFAULT_WATER_SURFACE_OPTICS_REFLECTION_SAMPLING_SETTINGS,
  resolveWaterSurfaceOpticsReflectionSamplingSettings,
  writeWaterSurfaceOpticsReflectionSamplingSettings
} from "../optics/WaterSurfaceOpticsBinding";
import type {
  WaterPlanarFilterSampleCount,
  WaterSurfaceOpticsReflectionSamplingConfig,
  WaterSurfaceOpticsReflectionSamplingSettings
} from "../optics/WaterSurfaceOpticsTypes";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import type { WaterReflectionSource } from "../optics/WaterReflectionPolicy";

export type HeightfieldWaterPlanarFilterSampleCount = WaterPlanarFilterSampleCount;
export type HeightfieldWaterReflectionSamplingSettings = WaterSurfaceOpticsReflectionSamplingSettings;
export type HeightfieldWaterReflectionSamplingConfig = WaterSurfaceOpticsReflectionSamplingConfig;

export type HeightfieldWaterReflectionSamplingFallbackReason =
  | NonNullable<WaterReflectionBinding["fallbackReason"]>
  | "heightfield-reflection-quality-unsupported"
  | "heightfield-probe-texture-unavailable"
  | "heightfield-planar-texture-unavailable"
  | "heightfield-planar-texture-size-invalid"
  | "heightfield-planar-view-projection-unavailable"
  | "heightfield-planar-view-projection-invalid";

export interface HeightfieldWaterReflectionSamplingReadback extends HeightfieldWaterReflectionSamplingSettings {
  readonly quality: WaterQualityTier;
  readonly requestedSource: WaterReflectionSource;
  readonly bindingResolvedSource: WaterReflectionSource;
  readonly effectiveSource: WaterReflectionSource;
  readonly fallbackReason?: HeightfieldWaterReflectionSamplingFallbackReason;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly filterSampleCount: HeightfieldWaterPlanarFilterSampleCount;
}

export const DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS: Readonly<HeightfieldWaterReflectionSamplingSettings> =
  DEFAULT_WATER_SURFACE_OPTICS_REFLECTION_SAMPLING_SETTINGS;

function isFiniteMatrix(matrix: Readonly<Matrix> | undefined): boolean {
  const elements = matrix?.elements;
  if (!elements || elements.length < 16) return false;
  for (let index = 0; index < 16; index++) {
    if (!Number.isFinite(elements[index])) return false;
  }
  return true;
}

export function resolveHeightfieldWaterReflectionSamplingSettings(
  config: HeightfieldWaterReflectionSamplingConfig = {}
): Readonly<HeightfieldWaterReflectionSamplingSettings> {
  return resolveWaterSurfaceOpticsReflectionSamplingSettings(config);
}

/** Heightfield adapter for the allocation-free shared settings sanitizer. */
export function writeHeightfieldWaterReflectionSamplingSettings(
  config: HeightfieldWaterReflectionSamplingConfig,
  outSettings: HeightfieldWaterReflectionSamplingSettings
): Readonly<HeightfieldWaterReflectionSamplingSettings> {
  return writeWaterSurfaceOpticsReflectionSamplingSettings(config, outSettings);
}

export function resolveHeightfieldWaterReflectionSampling(
  quality: WaterQualityTier,
  binding?: Readonly<WaterReflectionBinding>,
  config: HeightfieldWaterReflectionSamplingConfig = DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS
): Readonly<HeightfieldWaterReflectionSamplingReadback> {
  const settings = resolveHeightfieldWaterReflectionSamplingSettings(config);
  const requestedSource = binding?.requestedSource ?? "sky";
  const bindingResolvedSource = binding?.resolvedSource ?? "sky";
  let effectiveSource: WaterReflectionSource = bindingResolvedSource;
  let fallbackReason: HeightfieldWaterReflectionSamplingFallbackReason | undefined = binding?.fallbackReason;
  let textureWidth = 0;
  let textureHeight = 0;

  if (quality === WaterQualityTier.Low && bindingResolvedSource !== "sky") {
    effectiveSource = "sky";
    fallbackReason = "heightfield-reflection-quality-unsupported";
  } else if (bindingResolvedSource === "probe" && !binding?.probeTexture) {
    effectiveSource = "sky";
    fallbackReason = "heightfield-probe-texture-unavailable";
  } else if (bindingResolvedSource === "planar") {
    const texture = binding?.planarTexture;
    if (!texture) {
      effectiveSource = "sky";
      fallbackReason = "heightfield-planar-texture-unavailable";
    } else if (
      !Number.isFinite(texture.width) ||
      !Number.isFinite(texture.height) ||
      texture.width < 1 ||
      texture.height < 1
    ) {
      effectiveSource = "sky";
      fallbackReason = "heightfield-planar-texture-size-invalid";
    } else if (!binding.planarViewProjection) {
      effectiveSource = "sky";
      fallbackReason = "heightfield-planar-view-projection-unavailable";
    } else if (!isFiniteMatrix(binding.planarViewProjection)) {
      effectiveSource = "sky";
      fallbackReason = "heightfield-planar-view-projection-invalid";
    } else {
      textureWidth = Math.max(1, Math.floor(texture.width));
      textureHeight = Math.max(1, Math.floor(texture.height));
    }
  }

  const filterSampleCount: HeightfieldWaterPlanarFilterSampleCount =
    effectiveSource === "planar" && quality === WaterQualityTier.High && settings.highFilterSampleCount === 5 ? 5 : 1;
  return Object.freeze({
    ...settings,
    quality,
    requestedSource,
    bindingResolvedSource,
    effectiveSource,
    fallbackReason,
    textureWidth,
    textureHeight,
    filterSampleCount
  });
}
