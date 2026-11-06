/** Backend-independent authored sampling values for reflected radiance. */

export type WaterReflectionFilterSampleCount = 1 | 5;

export interface WaterReflectionSamplingSettings {
  readonly screenSpaceCompositeIntensity: number;
  readonly environmentFallbackIntensity: number;
  readonly distortionStrength: number;
  readonly maximumDistortionPixels: number;
  readonly edgeFadeTexels: number;
  readonly minimumClipW: number;
  readonly roughnessFootprintTexels: number;
  readonly highFilterSampleCount: WaterReflectionFilterSampleCount;
}

export type WaterReflectionSamplingConfig = Partial<WaterReflectionSamplingSettings>;

export const DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS: Readonly<WaterReflectionSamplingSettings> = Object.freeze({
  screenSpaceCompositeIntensity: 1,
  environmentFallbackIntensity: 1,
  distortionStrength: 0.025,
  maximumDistortionPixels: 64,
  edgeFadeTexels: 8,
  minimumClipW: 0.001,
  roughnessFootprintTexels: 3,
  highFilterSampleCount: 1
});

function finite(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value as number)) : fallback;
}

type MutableWaterReflectionSamplingSettings = {
  -readonly [Key in keyof WaterReflectionSamplingSettings]: WaterReflectionSamplingSettings[Key];
};

/** Sanitizes one authored sampling snapshot into caller-owned storage without allocating. */
export function writeWaterReflectionSamplingSettings(
  input: Readonly<WaterReflectionSamplingConfig>,
  output: WaterReflectionSamplingSettings
): Readonly<WaterReflectionSamplingSettings> {
  const target = output as MutableWaterReflectionSamplingSettings;
  const defaults = DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS;
  target.screenSpaceCompositeIntensity = finite(
    input.screenSpaceCompositeIntensity,
    defaults.screenSpaceCompositeIntensity,
    0,
    1
  );
  target.environmentFallbackIntensity = finite(
    input.environmentFallbackIntensity,
    defaults.environmentFallbackIntensity,
    0,
    4
  );
  target.distortionStrength = finite(input.distortionStrength, defaults.distortionStrength, 0, 0.25);
  target.maximumDistortionPixels = finite(input.maximumDistortionPixels, defaults.maximumDistortionPixels, 0, 64);
  target.edgeFadeTexels = finite(input.edgeFadeTexels, defaults.edgeFadeTexels, 1, 64);
  target.minimumClipW = finite(input.minimumClipW, defaults.minimumClipW, 0.000001, 1);
  target.roughnessFootprintTexels = finite(input.roughnessFootprintTexels, defaults.roughnessFootprintTexels, 0.5, 8);
  target.highFilterSampleCount = input.highFilterSampleCount === 5 ? 5 : 1;
  return output;
}

export function resolveWaterReflectionSamplingSettings(
  input: Readonly<WaterReflectionSamplingConfig> = Object.freeze({})
): Readonly<WaterReflectionSamplingSettings> {
  const output = { ...DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS };
  writeWaterReflectionSamplingSettings(input, output);
  return Object.freeze(output);
}
