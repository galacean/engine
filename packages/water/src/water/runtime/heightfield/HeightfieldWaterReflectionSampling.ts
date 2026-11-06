/** Pure reflection-sampling validation shared by the Heightfield material and runtime readback. */
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import {
  DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS,
  resolveWaterReflectionSamplingSettings,
  writeWaterReflectionSamplingSettings,
  type WaterReflectionFilterSampleCount,
  type WaterReflectionSamplingConfig,
  type WaterReflectionSamplingSettings
} from "../../authoring/optics/WaterReflectionSampling";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import type { WaterReflectionSource } from "../optics/WaterReflectionPolicy";

export type HeightfieldWaterReflectionSamplingSettings = WaterReflectionSamplingSettings;
export type HeightfieldWaterReflectionSamplingConfig = WaterReflectionSamplingConfig;

export type HeightfieldWaterReflectionSamplingFallbackReason =
  | NonNullable<WaterReflectionBinding["fallbackReason"]>
  | "heightfield-probe-texture-unavailable"
  | "heightfield-environment-metadata-invalid";

export interface HeightfieldWaterReflectionSamplingReadback extends HeightfieldWaterReflectionSamplingSettings {
  readonly quality: WaterQualityTier;
  readonly requestedSource: WaterReflectionSource;
  readonly bindingResolvedSource: WaterReflectionSource;
  readonly effectiveSource: WaterReflectionSource;
  readonly fallbackReason?: HeightfieldWaterReflectionSamplingFallbackReason;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly filterSampleCount: WaterReflectionFilterSampleCount;
}

export const DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS: Readonly<HeightfieldWaterReflectionSamplingSettings> =
  DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS;

export function resolveHeightfieldWaterReflectionSamplingSettings(
  config: HeightfieldWaterReflectionSamplingConfig = {}
): Readonly<HeightfieldWaterReflectionSamplingSettings> {
  return resolveWaterReflectionSamplingSettings(config);
}

/** Heightfield adapter for the allocation-free shared settings sanitizer. */
export function writeHeightfieldWaterReflectionSamplingSettings(
  config: HeightfieldWaterReflectionSamplingConfig,
  outSettings: HeightfieldWaterReflectionSamplingSettings
): Readonly<HeightfieldWaterReflectionSamplingSettings> {
  return writeWaterReflectionSamplingSettings(config, outSettings);
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

  if (bindingResolvedSource === "probe" && !binding?.probeTexture) {
    effectiveSource = "sky";
    fallbackReason = "heightfield-probe-texture-unavailable";
  }

  return Object.freeze({
    ...settings,
    quality,
    requestedSource,
    bindingResolvedSource,
    effectiveSource,
    fallbackReason,
    textureWidth: 0,
    textureHeight: 0,
    filterSampleCount: 1
  });
}
