import { MathUtil } from "./MathUtil";

/** Parameters for seeded, normalized two-dimensional value-noise FBM. */
export interface Fbm2DOptions {
  /** Integer seed. The lattice uses its low 32 bits. */
  readonly seed: number;
  /** Number of octave bands, from 1 to 32. */
  readonly octaves: number;
  /** Frequency multiplier per octave. Defaults to 2. */
  readonly lacunarity?: number;
  /** Weight multiplier per octave, in [0, 1]. Defaults to 0.5. */
  readonly persistence?: number;
}

/**
 * Prepare a deterministic FBM sampler. The first octave has unit frequency.
 * Equal noise coordinates and options always produce the same value in [-1, 1].
 * @param options - Noise parameters.
 * @returns A sampler of dimensionless X and Z coordinates.
 */
export function createFbm2D({
  seed,
  octaves,
  lacunarity = 2,
  persistence = 0.5
}: Fbm2DOptions): (x: number, z: number) => number {
  if (!Number.isSafeInteger(seed)) throw new RangeError("FBM seed must be a safe integer.");
  if (!Number.isInteger(octaves) || octaves < 1 || octaves > 32) {
    throw new RangeError("FBM octaves must be an integer from 1 to 32.");
  }
  if (!Number.isFinite(lacunarity) || lacunarity <= 0) {
    throw new RangeError("FBM lacunarity must be positive and finite.");
  }
  if (!Number.isFinite(persistence) || persistence < 0 || persistence > 1) {
    throw new RangeError("FBM persistence must be in [0, 1].");
  }

  const bands: { frequency: number; weight: number; seed: number }[] = [];
  const latticeSeed = seed >>> 0;
  let frequency = 1;
  let weight = 1;
  let totalWeight = 0;
  let highestFrequency = 1;
  for (let octave = 0; octave < octaves && weight > 0; octave++) {
    if (!Number.isFinite(frequency)) throw new RangeError("FBM octave frequency exceeds the numeric range.");
    bands.push({ frequency, weight, seed: (latticeSeed + Math.imul(octave, 0x9e37_79b1)) >>> 0 });
    totalWeight += weight;
    highestFrequency = Math.max(highestFrequency, frequency);
    frequency *= lacunarity;
    weight *= persistence;
  }

  return (x, z) => {
    if (!Number.isFinite(x * highestFrequency) || !Number.isFinite(z * highestFrequency)) {
      throw new RangeError("FBM coordinates must be finite at every octave.");
    }
    let sum = 0;
    for (const band of bands) {
      sum += valueNoise(x * band.frequency, z * band.frequency, band.seed) * band.weight;
    }
    return (sum / totalWeight) * 2 - 1;
  };
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = quintic(x - x0);
  const tz = quintic(z - z0);
  const near = MathUtil.lerp(latticeNoise(x0, z0, seed), latticeNoise(x0 + 1, z0, seed), tx);
  const far = MathUtil.lerp(latticeNoise(x0, z0 + 1, seed), latticeNoise(x0 + 1, z0 + 1, seed), tx);
  return MathUtil.lerp(near, far, tz);
}

function latticeNoise(x: number, z: number, seed: number): number {
  let value = Math.imul(x, 0x1f12_3bb5) ^ Math.imul(z, 0x5f35_6495) ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffff_ffff;
}

function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
