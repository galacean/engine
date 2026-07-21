/** Deterministic Ocean Gerstner fixtures kept separate from river authoring descriptors. */
import { WaterQualityTier } from "../../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../../authoring/wave/enums/WaterWaveSchemaVersion";
import type { DirectionalGerstnerWaterWaveAssetV1 } from "../../../authoring/wave/WaterWaveTypes";
import type { OceanPreviewConfig } from "./types";

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
