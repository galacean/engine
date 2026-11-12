/** Pure reflection-sampling validation shared by the Heightfield material and runtime readback. */
import {
  DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS,
  resolveWaterReflectionSamplingSettings,
  writeWaterReflectionSamplingSettings,
  type WaterReflectionSamplingConfig,
  type WaterReflectionSamplingSettings
} from "../../authoring/optics/WaterReflectionSampling";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";

export type HeightfieldWaterReflectionSamplingSettings = WaterReflectionSamplingSettings;
export type HeightfieldWaterReflectionSamplingConfig = WaterReflectionSamplingConfig;

export type HeightfieldWaterReflectionSamplingFallbackReason =
  | NonNullable<WaterReflectionBinding["fallbackReason"]>
  | "heightfield-probe-texture-unavailable"
  | "heightfield-environment-metadata-invalid";

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
