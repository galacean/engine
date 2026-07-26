/** Deterministic Ocean Gerstner fixtures kept separate from river authoring descriptors. */
import { WaterQualityTier } from "../../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../../authoring/wave/enums/WaterWaveSchemaVersion";
import type { DirectionalGerstnerWaterWaveAssetV1 } from "../../../authoring/wave/WaterWaveTypes";
import type { WaterOpticalProfile } from "../../../runtime/optics/WaterOpticalProfile";
import type { OceanPreviewConfig } from "./types";
import { createOceanBeachNearshoreDescriptor } from "../../ocean/OceanBeachShowcasePreset";

function createOceanWaveAsset(
  seed: number,
  minWavelength: number,
  maxWavelength: number,
  minAmplitude: number,
  maxAmplitude: number,
  dominantWindAngle: number,
  dominantAngularSpread: number,
  largeWaveSteepness: number
): DirectionalGerstnerWaterWaveAssetV1 {
  return {
    schemaVersion: WaterWaveSchemaVersion.V1,
    model: WaterWaveModel.DirectionalGerstner,
    generator: {
      waveCount: 16,
      seed,
      randomness: 0.82,
      minWavelength,
      maxWavelength,
      wavelengthFalloff: 1.25,
      minAmplitude,
      maxAmplitude,
      amplitudeFalloff: 1.55,
      dominantWindAngle,
      dominantAngularSpread,
      smallWaveSteepness: 0.24,
      largeWaveSteepness,
      steepnessFalloff: 1.2
    }
  };
}

export const curvedMainRiverOceanPreview: OceanPreviewConfig = {
  size: 90,
  resolution: 72,
  waterLevel: 0,
  amplitudeScale: 1,
  timeScale: 0.85,
  quality: WaterQualityTier.Medium,
  waveAsset: createOceanWaveAsset(41791, 2.2, 28, 0.025, 0.48, 0.35, 1.1, 0.68),
  alpha: 0.72,
  foamIntensity: 1.1,
  oceanColor: "#1c8fc7"
};

export const multiTributaryOceanPreview: OceanPreviewConfig = {
  size: 96,
  resolution: 72,
  waterLevel: -0.05,
  amplitudeScale: 1,
  timeScale: 0.72,
  quality: WaterQualityTier.Medium,
  waveAsset: createOceanWaveAsset(55219, 2.8, 34, 0.02, 0.4, -0.28, 1.28, 0.62),
  alpha: 0.68,
  foamIntensity: 1.25,
  oceanColor: "#207f9b"
};

/** Stable water surface used by the terrain demo's optional water debug overlay. */
export const riverExpandedLakeOceanPreview: OceanPreviewConfig = {
  size: 96,
  resolution: 72,
  waterLevel: 0.2,
  amplitudeScale: 1,
  timeScale: 0.38,
  quality: WaterQualityTier.Medium,
  waveAsset: createOceanWaveAsset(23813, 4.5, 36, 0.01, 0.2, 0.18, 0.72, 0.42),
  alpha: 0.64,
  foamIntensity: 0.45,
  oceanColor: "#176f83"
};

export const indoorReflectivePoolOceanPreview: OceanPreviewConfig = {
  size: 72,
  resolution: 64,
  waterLevel: 0.1,
  amplitudeScale: 1,
  timeScale: 0.18,
  quality: WaterQualityTier.Low,
  waveAsset: createOceanWaveAsset(11939, 5.5, 24, 0.004, 0.085, 0.08, 0.38, 0.24),
  alpha: 0.5,
  foamIntensity: 0.08,
  oceanColor: "#159fc7"
};

export const SHOWCASE_OCEAN_OPTICAL_PROFILE = Object.freeze({
  absorptionCoefficient: [0.25, 0.12, 0.055],
  scatteringColor: [0.042, 0.105, 0.11],
  scatteringCoefficient: 0.09,
  maximumViewDistance: 42,
  indexOfRefraction: 1.333,
  maximumSurfaceOpticalDistance: 18,
  refractionStrength: 0.13,
  roughness: 0.48,
  reflectionIntensity: 1
} satisfies WaterOpticalProfile);

/** Canonical High ocean used by focused features and LOD developer presets. */
export const showcaseOceanPreview: OceanPreviewConfig = {
  size: 240,
  resolution: 192,
  waterLevel: 0,
  amplitudeScale: 1,
  timeScale: 0.82,
  quality: WaterQualityTier.High,
  waveAsset: createOceanWaveAsset(
    73129,
    5.2,
    54,
    0.0035,
    0.105,
    -0.18,
    0.68,
    0.235
  ),
  alpha: 0.86,
  foamIntensity: 0.72,
  foamEnabled: true,
  foamSourceOptions: Object.freeze({
    breakerIntensity: 0.62,
    breakerMinimumActivation: 0.34,
    breakerFullActivation: 0.84,
    shoreIntensity: 0.9,
    shoreBandWidth: 1.15,
    shoreSeawardOffset: 4
  }),
  oceanColor: "#1b4e58",
  surfaceDetail: {
    strength: 0.15,
    scale: 0.3,
    speed: 0.03,
    wind: [0.984, -0.179]
  },
  nearshoreDescriptor: createOceanBeachNearshoreDescriptor(),
  nearshoreStateOptions: Object.freeze({
    swashPeriodSeconds: 6.8,
    minimumRunupDistance: 0.1,
    maximumRunupDistance: 2.2,
    filmDepth: 0.034,
    wetnessDryingRate: 0.4,
    maximumSwashSpeed: 1.15
  }),
  reflectionSource: "planar",
  reflectionIntensity: 0.38,
  planarColorMode: "hdr-preferred",
  opticsTier: "high",
  opticalProfile: SHOWCASE_OCEAN_OPTICAL_PROFILE,
  refractionEnabled: true,
  reflectionSampling: {
    distortionStrength: 0.011,
    edgeFadeTexels: 12,
    roughnessFootprintTexels: 14,
    highFilterSampleCount: 5
  }
};

/**
 * Hero-only composition tuning. The larger camera-relative footprint removes
 * the finite-ring edge at a grazing showcase camera without adding patches.
 */
export const showcaseOceanHeroPreview: OceanPreviewConfig = {
  ...showcaseOceanPreview,
  size: 1600,
  foamIntensity: 0.58,
  foamSourceOptions: Object.freeze({
    breakerIntensity: 0.42,
    breakerMinimumActivation: 0.5,
    breakerFullActivation: 0.92,
    shoreIntensity: 0.5,
    shoreBandWidth: 0.5,
    shoreSeawardOffset: 2
  }),
  nearshoreStateOptions: Object.freeze({
    ...showcaseOceanPreview.nearshoreStateOptions,
    swashPeriodSeconds: 7.6,
    maximumRunupDistance: 1.65,
    maximumSwashSpeed: 0.8,
    thinFilmTransitionWidth: 1.25
  })
};

/** Isolated High wave preset: identical Gerstner source without the authored beach scenery. */
export const gerstnerFeatureOceanPreview: OceanPreviewConfig = {
  ...showcaseOceanPreview,
  size: 180,
  amplitudeScale: 2.4,
  timeScale: 0.72,
  foamIntensity: 0.62,
  foamEnabled: true,
  surfaceDetail: {
    strength: 0.09,
    scale: 0.3,
    speed: 0.03,
    wind: [0.984, -0.179]
  },
  nearshoreDescriptor: undefined,
  reflectionSource: "planar",
  reflectionIntensity: 0.55,
  opticalProfile: Object.freeze({
    ...SHOWCASE_OCEAN_OPTICAL_PROFILE,
    roughness: 0.36
  }),
  reflectionSampling: {
    ...showcaseOceanPreview.reflectionSampling,
    highFilterSampleCount: 1
  }
};
