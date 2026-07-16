/** Deterministic candidate generation for directional Gerstner wave assets. */
import {
  WATER_WAVE_GRAVITY,
  WATER_WAVE_PRNG_INCREMENT,
  WATER_WAVE_PRNG_MULTIPLIER_A,
  WATER_WAVE_TWO_PI,
  WATER_WAVE_UINT32_RANGE
} from "../../authoring/wave/constants/WaterWaveLimits";
import type { GerstnerWaveGeneratorConfig } from "../../authoring/wave/types/WaterWaveTypes";
import type { GerstnerWaveCandidate } from "./types/CompiledWaterWaveTypes";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(minimum: number, maximum: number, t: number): number {
  return minimum + (maximum - minimum) * t;
}

class DeterministicRandom {
  private _state: number;

  constructor(seed: number) {
    this._state = seed >>> 0;
  }

  next(): number {
    this._state = (Math.imul(this._state, WATER_WAVE_PRNG_MULTIPLIER_A) + WATER_WAVE_PRNG_INCREMENT) >>> 0;
    return this._state / WATER_WAVE_UINT32_RANGE;
  }

  nextSigned(): number {
    return this.next() * 2 - 1;
  }
}

function jitteredProgress(index: number, count: number, randomness: number, random: DeterministicRandom): number {
  const progress = count === 1 ? 0.5 : index / (count - 1);
  const jitter = (random.nextSigned() * randomness) / Math.max(count, 1);
  return clamp01(progress + jitter);
}

export function generateGerstnerWaveCandidates(config: GerstnerWaveGeneratorConfig): readonly GerstnerWaveCandidate[] {
  const random = new DeterministicRandom(config.seed);
  const candidates: GerstnerWaveCandidate[] = [];
  for (let sourceIndex = 0; sourceIndex < config.waveCount; sourceIndex++) {
    const wavelengthProgress = jitteredProgress(sourceIndex, config.waveCount, config.randomness, random);
    const amplitudeProgress = jitteredProgress(sourceIndex, config.waveCount, config.randomness, random);
    const wavelength = lerp(
      config.minWavelength,
      config.maxWavelength,
      Math.pow(wavelengthProgress, config.wavelengthFalloff)
    );
    const amplitude = lerp(
      config.minAmplitude,
      config.maxAmplitude,
      Math.pow(amplitudeProgress, config.amplitudeFalloff)
    );
    const steepness = lerp(
      config.smallWaveSteepness,
      config.largeWaveSteepness,
      Math.pow(wavelengthProgress, config.steepnessFalloff)
    );
    const directionAngle =
      config.dominantWindAngle + random.nextSigned() * config.dominantAngularSpread * config.randomness;
    const waveNumber = WATER_WAVE_TWO_PI / wavelength;
    candidates.push(
      Object.freeze({
        sourceIndex,
        directionX: Math.cos(directionAngle),
        directionZ: Math.sin(directionAngle),
        amplitude,
        wavelength,
        waveNumber,
        angularFrequency: Math.sqrt(WATER_WAVE_GRAVITY * waveNumber),
        steepness,
        phase: random.next() * WATER_WAVE_TWO_PI,
        energy: amplitude * amplitude
      })
    );
  }
  return Object.freeze(candidates);
}
