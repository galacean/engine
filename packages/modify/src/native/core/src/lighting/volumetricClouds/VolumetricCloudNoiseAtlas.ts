/** Tiles per row and column in the packed base-noise atlas. */
export const VOLUMETRIC_CLOUD_NOISE_ATLAS_GRID = 8;
/** Width and height of one packed 3D-noise slice. */
export const VOLUMETRIC_CLOUD_NOISE_SLICE_SIZE = 32;

/** Bake recipe and shader decoding contract for the packed base/detail noise. */
export interface VolumetricCloudNoiseProfile {
  readonly perlinBaseFrequency: number;
  readonly perlinOctaves: number;
  readonly perlinGain: number;
  readonly worleyFrequencies: readonly [number, number, number];
  readonly worleyWeights: readonly [number, number, number];
  readonly perlinBlend: number;
}

const DEFAULT_WORLEY_FREQUENCIES = Object.freeze([4, 8, 16] as const);
const DEFAULT_WORLEY_WEIGHTS = Object.freeze([0.625, 0.25, 0.125] as const);

/** Production noise encoding shared by the CPU baker and density shader. */
export const VOLUMETRIC_CLOUD_DEFAULT_NOISE_PROFILE: Readonly<VolumetricCloudNoiseProfile> = Object.freeze({
  perlinBaseFrequency: 4,
  perlinOctaves: 4,
  perlinGain: 2 ** -0.85,
  worleyFrequencies: DEFAULT_WORLEY_FREQUENCIES,
  worleyWeights: DEFAULT_WORLEY_WEIGHTS,
  perlinBlend: 0.5
});

const HASH_X = 1597334673;
const HASH_Y = 3812015801;
const HASH_Z = 2798796415;
const UINT_MAX = 0xffffffff;

/** Width and height of the packed base-noise atlas. */
export const VOLUMETRIC_CLOUD_NOISE_ATLAS_SIZE = VOLUMETRIC_CLOUD_NOISE_ATLAS_GRID * VOLUMETRIC_CLOUD_NOISE_SLICE_SIZE;
/** Number of 3D base-noise slices packed into the atlas. */
export const VOLUMETRIC_CLOUD_NOISE_DEPTH = VOLUMETRIC_CLOUD_NOISE_ATLAS_GRID * VOLUMETRIC_CLOUD_NOISE_ATLAS_GRID;

/**
 * Build deterministic tileable RGBA base noise for volumetric clouds.
 *
 * R stores Perlin-Worley shape noise. GBA store the same low, middle and high
 * Worley bands used by the density shader to dilate the base shape. The hash,
 * billowy Perlin FBM and Worley combination follow the HDRP cloud-noise baker;
 * precomputed hash fields keep this one-time CPU bake practical in browsers.
 */
export function buildVolumetricCloudNoiseAtlas(
  noiseProfile: Readonly<VolumetricCloudNoiseProfile> = VOLUMETRIC_CLOUD_DEFAULT_NOISE_PROFILE
): Uint8Array {
  const profile = createVolumetricCloudNoiseProfile(noiseProfile);
  const fields = new Map<number, HashField>();
  for (
    let octave = 0, frequency = profile.perlinBaseFrequency;
    octave < profile.perlinOctaves;
    octave++, frequency *= 2
  ) {
    fields.set(frequency, buildHashField(frequency));
  }
  for (const frequency of profile.worleyFrequencies) {
    if (!fields.has(frequency)) fields.set(frequency, buildHashField(frequency));
  }

  const pixels = new Uint8Array(VOLUMETRIC_CLOUD_NOISE_ATLAS_SIZE * VOLUMETRIC_CLOUD_NOISE_ATLAS_SIZE * 4);
  for (let z = 0; z < VOLUMETRIC_CLOUD_NOISE_DEPTH; z++) {
    const tileX = z % VOLUMETRIC_CLOUD_NOISE_ATLAS_GRID;
    const tileY = Math.floor(z / VOLUMETRIC_CLOUD_NOISE_ATLAS_GRID);
    const w = z / VOLUMETRIC_CLOUD_NOISE_DEPTH;
    for (let y = 0; y < VOLUMETRIC_CLOUD_NOISE_SLICE_SIZE; y++) {
      // atlasUv() maps wrapped XY across the first and last texel centers of
      // each clamped tile, so the endpoint samples must be periodic duplicates.
      const v = y / (VOLUMETRIC_CLOUD_NOISE_SLICE_SIZE - 1);
      for (let x = 0; x < VOLUMETRIC_CLOUD_NOISE_SLICE_SIZE; x++) {
        const u = x / (VOLUMETRIC_CLOUD_NOISE_SLICE_SIZE - 1);
        const worleyLow = invertedWorley(u, v, w, fields.get(profile.worleyFrequencies[0])!);
        const worleyMiddle = invertedWorley(u, v, w, fields.get(profile.worleyFrequencies[1])!);
        const worleyHigh = invertedWorley(u, v, w, fields.get(profile.worleyFrequencies[2])!);
        const worleyFbm =
          worleyLow * profile.worleyWeights[0] +
          worleyMiddle * profile.worleyWeights[1] +
          worleyHigh * profile.worleyWeights[2];
        const perlin = mix(1, perlinFbm(u, v, w, fields, profile), profile.perlinBlend);
        const billowyPerlin = Math.min(1, Math.abs(perlin * 2 - 1));
        const perlinWorley = mix(worleyFbm, 1, billowyPerlin);
        const destination =
          ((tileY * VOLUMETRIC_CLOUD_NOISE_SLICE_SIZE + y) * VOLUMETRIC_CLOUD_NOISE_ATLAS_SIZE +
            tileX * VOLUMETRIC_CLOUD_NOISE_SLICE_SIZE +
            x) *
          4;
        pixels[destination] = toByte(perlinWorley);
        pixels[destination + 1] = toByte(worleyLow);
        pixels[destination + 2] = toByte(worleyMiddle);
        pixels[destination + 3] = toByte(worleyHigh);
      }
    }
  }
  return pixels;
}

interface HashField {
  readonly frequency: number;
  /** XYZ feature positions in [0, 1]; multiplying by two and subtracting one yields the matching gradient. */
  readonly features: Float32Array;
}

function buildHashField(frequency: number): HashField {
  const features = new Float32Array(frequency * frequency * frequency * 3);
  for (let z = 0; z < frequency; z++) {
    for (let y = 0; y < frequency; y++) {
      for (let x = 0; x < frequency; x++) {
        const qx = Math.imul(x, HASH_X) >>> 0;
        const qy = Math.imul(y, HASH_Y) >>> 0;
        const qz = Math.imul(z, HASH_Z) >>> 0;
        const hash = (qx ^ qy ^ qz) >>> 0;
        const destination = ((z * frequency + y) * frequency + x) * 3;
        features[destination] = (Math.imul(hash, HASH_X) >>> 0) / UINT_MAX;
        features[destination + 1] = (Math.imul(hash, HASH_Y) >>> 0) / UINT_MAX;
        features[destination + 2] = (Math.imul(hash, HASH_Z) >>> 0) / UINT_MAX;
      }
    }
  }
  return { frequency, features };
}

function perlinFbm(
  u: number,
  v: number,
  w: number,
  fields: ReadonlyMap<number, HashField>,
  profile: Readonly<VolumetricCloudNoiseProfile>
): number {
  let result = 0;
  let amplitude = 1;
  let frequency = profile.perlinBaseFrequency;
  for (let octave = 0; octave < profile.perlinOctaves; octave++) {
    result += amplitude * gradientNoise(u, v, w, fields.get(frequency)!);
    amplitude *= profile.perlinGain;
    frequency *= 2;
  }
  return result;
}

function gradientNoise(u: number, v: number, w: number, field: HashField): number {
  const frequency = field.frequency;
  const px = u * frequency;
  const py = v * frequency;
  const pz = w * frequency;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const z0 = Math.floor(pz);
  const fx = px - x0;
  const fy = py - y0;
  const fz = pz - z0;
  const tx = quintic(fx);
  const ty = quintic(fy);
  const tz = quintic(fz);
  const dot = (dx: number, dy: number, dz: number): number => {
    const index = fieldIndex(x0 + dx, y0 + dy, z0 + dz, frequency);
    const features = field.features;
    return (
      (features[index] * 2 - 1) * (fx - dx) +
      (features[index + 1] * 2 - 1) * (fy - dy) +
      (features[index + 2] * 2 - 1) * (fz - dz)
    );
  };
  const x00 = mix(dot(0, 0, 0), dot(1, 0, 0), tx);
  const x10 = mix(dot(0, 1, 0), dot(1, 1, 0), tx);
  const x01 = mix(dot(0, 0, 1), dot(1, 0, 1), tx);
  const x11 = mix(dot(0, 1, 1), dot(1, 1, 1), tx);
  return mix(mix(x00, x10, ty), mix(x01, x11, ty), tz);
}

function invertedWorley(u: number, v: number, w: number, field: HashField): number {
  const frequency = field.frequency;
  const px = u * frequency;
  const py = v * frequency;
  const pz = w * frequency;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const z0 = Math.floor(pz);
  const fx = px - x0;
  const fy = py - y0;
  const fz = pz - z0;
  let minimumDistanceSquared = Number.POSITIVE_INFINITY;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const index = fieldIndex(x0 + dx, y0 + dy, z0 + dz, frequency);
        const features = field.features;
        const distanceX = fx - (features[index] + dx);
        const distanceY = fy - (features[index + 1] + dy);
        const distanceZ = fz - (features[index + 2] + dz);
        minimumDistanceSquared = Math.min(
          minimumDistanceSquared,
          distanceX * distanceX + distanceY * distanceY + distanceZ * distanceZ
        );
      }
    }
  }
  return Math.max(0, Math.min(1, 1 - Math.sqrt(minimumDistanceSquared)));
}

function fieldIndex(x: number, y: number, z: number, frequency: number): number {
  return ((mod(z, frequency) * frequency + mod(y, frequency)) * frequency + mod(x, frequency)) * 3;
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function toByte(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
}

/** Validate, normalize and detach a base-noise resource profile. */
export function createVolumetricCloudNoiseProfile(
  profile: Readonly<VolumetricCloudNoiseProfile> = VOLUMETRIC_CLOUD_DEFAULT_NOISE_PROFILE
): Readonly<VolumetricCloudNoiseProfile> {
  if (
    !Number.isSafeInteger(profile.perlinBaseFrequency) ||
    profile.perlinBaseFrequency <= 0 ||
    !Number.isSafeInteger(profile.perlinOctaves) ||
    profile.perlinOctaves <= 0 ||
    !Number.isFinite(profile.perlinGain) ||
    profile.perlinGain <= 0 ||
    profile.perlinGain > 1 ||
    !Array.isArray(profile.worleyFrequencies) ||
    profile.worleyFrequencies.length !== 3 ||
    profile.worleyFrequencies.some((frequency) => !Number.isSafeInteger(frequency) || frequency <= 0) ||
    !Array.isArray(profile.worleyWeights) ||
    profile.worleyWeights.length !== 3 ||
    profile.worleyWeights.some((weight) => !Number.isFinite(weight) || weight < 0) ||
    !Number.isFinite(profile.perlinBlend) ||
    profile.perlinBlend < 0 ||
    profile.perlinBlend > 1
  ) {
    throw new RangeError("Volumetric cloud noise profile contains an invalid frequency, weight or blend");
  }
  const weightSum = profile.worleyWeights[0] + profile.worleyWeights[1] + profile.worleyWeights[2];
  if (weightSum <= 0) throw new RangeError("Volumetric cloud Worley weights must contain positive energy");
  const frequencies: [number, number, number] = [
    profile.worleyFrequencies[0],
    profile.worleyFrequencies[1],
    profile.worleyFrequencies[2]
  ];
  const weights: [number, number, number] = [
    profile.worleyWeights[0] / weightSum,
    profile.worleyWeights[1] / weightSum,
    profile.worleyWeights[2] / weightSum
  ];
  Object.freeze(frequencies);
  Object.freeze(weights);
  return Object.freeze({ ...profile, worleyFrequencies: frequencies, worleyWeights: weights });
}
