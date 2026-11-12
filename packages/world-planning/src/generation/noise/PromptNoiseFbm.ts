import { hashPromptNoise } from "./PromptNoiseHash";

/**
 * Maps a world seed to a whole-cell FBM translation without changing the Terrain3D frequency spectrum.
 * @param rootSeed Unsigned world seed; zero reproduces Terrain3D's authored coordinates exactly.
 * @returns Deterministic XZ offsets in Terrain3D region-space units.
 */
export function promptNoiseFbmSeedOffset(rootSeed: number): readonly [x: number, z: number] {
  if (rootSeed >>> 0 === 0) return Object.freeze([0, 0] as const);
  const x = (hashPromptNoise(rootSeed, 0x4642_4d58) & 0x3ff) - 512;
  const z = (hashPromptNoise(rootSeed, 0x4642_4d5a) & 0x3ff) - 512;
  return Object.freeze([x, z] as const);
}

/**
 * Evaluates the four-octave derivative-damped FBM used by the infinite noise terrain.
 * @param x Noise-space X coordinate.
 * @param z Noise-space Z coordinate.
 * @returns Nonnegative noise height before vertical scaling.
 */
export function referenceFbm(x: number, z: number): number {
  let amplitude = 0;
  let weight = 1;
  let derivativeX = 0;
  let derivativeZ = 0;
  for (let octave = 0; octave < 4; octave++) {
    const noise = referenceNoise(x, z);
    derivativeX += noise.derivativeX;
    derivativeZ += noise.derivativeZ;
    amplitude += (weight * noise.value) / (1 + derivativeX * derivativeX + derivativeZ * derivativeZ);
    weight *= 0.5;
    const nextX = (0.8 * x + 0.6 * z) * 2;
    const nextZ = (-0.6 * x + 0.8 * z) * 2;
    x = nextX;
    z = nextZ;
  }
  return amplitude;
}

function referenceNoise(x: number, z: number): { value: number; derivativeX: number; derivativeZ: number } {
  const fx = fract(x);
  const fz = fract(z);
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const ux = fx ** 3 * (fx * (fx * 6 - 15) + 10);
  const uz = fz ** 3 * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx ** 2 * (fx - 1) ** 2;
  const duz = 30 * fz ** 2 * (fz - 1) ** 2;
  const a = referenceHash(ix, iz);
  const b = referenceHash(ix + 1, iz);
  const c = referenceHash(ix, iz + 1);
  const d = referenceHash(ix + 1, iz + 1);
  const k1 = b - a;
  const k2 = c - a;
  const k3 = d - b - k2;
  return {
    value: k2 * uz + ux * (k3 * uz + k1) + a,
    derivativeX: dux * (k3 * uz + k1),
    derivativeZ: duz * (k3 * ux + k2)
  };
}

function referenceHash(x: number, z: number): number {
  // All permutation intermediates are integers below 2^24, matching highp GLSL arithmetic.
  return referencePermute(referenceMod289(referencePermute(referenceMod289(x)) + referenceMod289(z))) / 289;
}
function referenceMod289(value: number): number {
  return value - Math.floor(value / 289) * 289;
}
function referencePermute(value: number): number {
  return referenceMod289((value * 34 + 1) * value);
}

function fract(value: number): number {
  return value - Math.floor(value);
}
