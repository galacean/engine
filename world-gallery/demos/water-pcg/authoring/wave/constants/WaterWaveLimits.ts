/** Authoring limits, fixed budgets, and packed-layout constants for water waves. */
import { WaterQualityTier } from "../enums/WaterQualityTier";

export const WATER_WAVE_COMPILER_VERSION = 1;
export const WATER_WAVE_TWO_PI = Math.PI * 2;
export const WATER_WAVE_GRAVITY = 9.81;
export const WATER_WAVE_EPSILON = 1e-6;
export const WATER_WAVE_FAST_ACTIVE_COUNT = 2;
export const WATER_WAVE_PACKED_FLOATS_PER_WAVE = 8;
export const WATER_WAVE_STEEPNESS_WARNING_THRESHOLD = 0.75;
export const WATER_WAVE_MAX_HORIZONTAL_AMPLITUDE_RATIO = 1.5;
export const WATER_WAVE_PRNG_INCREMENT = 0x6d2b79f5;
export const WATER_WAVE_PRNG_MULTIPLIER_A = 0x1b873593;
export const WATER_WAVE_PRNG_MULTIPLIER_B = 0x5bd1e995;
export const WATER_WAVE_UINT32_RANGE = 0x100000000;

export const WATER_WAVE_PACKED_OFFSET = {
  directionX: 0,
  directionZ: 1,
  amplitude: 2,
  waveNumber: 3,
  angularFrequency: 4,
  horizontalAmplitude: 5,
  phase: 6,
  energy: 7
} as const;

export const WATER_WAVE_ACTIVE_COUNT_BY_QUALITY: Readonly<Record<WaterQualityTier, number>> = {
  [WaterQualityTier.Low]: 2,
  [WaterQualityTier.Medium]: 6,
  [WaterQualityTier.High]: 12
};

export const WATER_WAVE_LIMITS = {
  minWaveCount: 1,
  maxWaveCount: 16,
  minSeed: 0,
  maxSeed: 0x7fffffff,
  minRandomness: 0,
  maxRandomness: 1,
  minWavelength: 0.25,
  maxWavelength: 512,
  minFalloff: 0.1,
  maxFalloff: 8,
  minAmplitude: 0,
  maxAmplitude: 8,
  minWindAngle: -WATER_WAVE_TWO_PI,
  maxWindAngle: WATER_WAVE_TWO_PI,
  minAngularSpread: 0,
  maxAngularSpread: Math.PI,
  minSteepness: 0,
  maxSteepness: 0.85
} as const;
