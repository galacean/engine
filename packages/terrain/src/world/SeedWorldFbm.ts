/** Band-limited ground-noise parameters shared by Seed World terrain generators. */
export interface SeedWorldFbmParameters {
  /** Broad rolling-ground wavelength in metres. */
  readonly rollingWavelengthMetres: number;
  /** Broad rolling-ground height amplitude in metres. */
  readonly rollingAmplitudeMetres: number;
  /** Broad rolling-ground octave count. */
  readonly rollingOctaves: number;
  /** Fine ground-detail wavelength in metres. */
  readonly detailWavelengthMetres: number;
  /** Fine ground-detail height amplitude in metres. */
  readonly detailAmplitudeMetres: number;
  /** Fine ground-detail octave count. */
  readonly detailOctaves: number;
  /** Domain-warp wavelength in metres. */
  readonly warpWavelengthMetres: number;
  /** Domain-warp horizontal displacement in metres. */
  readonly warpAmplitudeMetres: number;
  /** Domain-warp octave count. */
  readonly warpOctaves: number;
}

/** Authoritative Seed World broad-ground FBM profile. */
export const SEED_WORLD_DEFAULT_FBM = Object.freeze<SeedWorldFbmParameters>({
  rollingWavelengthMetres: 720,
  rollingAmplitudeMetres: 36,
  rollingOctaves: 4,
  detailWavelengthMetres: 180,
  detailAmplitudeMetres: 10,
  detailOctaves: 3,
  warpWavelengthMetres: 1_200,
  warpAmplitudeMetres: 180,
  warpOctaves: 3
});

/**
 * Samples the exact domain-warped Seed World ground offset before mountain brushes.
 * @param worldX World-space X in metres.
 * @param worldZ World-space Z in metres.
 * @param geologySeed Deterministic geology stream owning the terrain morphology.
 * @param parameters Band-limited wavelengths, amplitudes, and octave counts.
 * @returns Signed height offset in metres.
 */
export function sampleSeedWorldFbmHeightOffsetMetres(
  worldX: number,
  worldZ: number,
  geologySeed: number,
  parameters: SeedWorldFbmParameters = SEED_WORLD_DEFAULT_FBM
): number {
  const warpX =
    sampleSeedWorldCenteredFbm(
      worldX / parameters.warpWavelengthMetres,
      worldZ / parameters.warpWavelengthMetres,
      geologySeed ^ 0x8a5c_31d7,
      parameters.warpOctaves
    ) * parameters.warpAmplitudeMetres;
  const warpZ =
    sampleSeedWorldCenteredFbm(
      worldX / parameters.warpWavelengthMetres,
      worldZ / parameters.warpWavelengthMetres,
      geologySeed ^ 0x4f13_b9a1,
      parameters.warpOctaves
    ) * parameters.warpAmplitudeMetres;
  const warpedX = worldX + warpX;
  const warpedZ = worldZ + warpZ;
  const rolling = sampleSeedWorldCenteredFbm(
    warpedX / parameters.rollingWavelengthMetres,
    warpedZ / parameters.rollingWavelengthMetres,
    geologySeed ^ 0x6d9f_2b45,
    parameters.rollingOctaves
  );
  const detail = sampleSeedWorldCenteredFbm(
    warpedX / parameters.detailWavelengthMetres,
    warpedZ / parameters.detailWavelengthMetres,
    geologySeed ^ 0x19c3_75ef,
    parameters.detailOctaves
  );
  return rolling * parameters.rollingAmplitudeMetres + detail * parameters.detailAmplitudeMetres;
}

/**
 * Samples normalized signed FBM with Seed World's value-noise lattice and octave weighting.
 * @param x Dimensionless X coordinate.
 * @param z Dimensionless Z coordinate.
 * @param seed Unsigned deterministic lattice identity.
 * @param octaves Number of octave bands.
 * @returns Value in the inclusive range negative one to one.
 */
export function sampleSeedWorldCenteredFbm(x: number, z: number, seed: number, octaves: number): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += valueNoise(x * frequency, z * frequency, seed + Math.imul(octave, 0x9e37_79b1)) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return (sum / weight) * 2 - 1;
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const amountX = quintic(x - x0);
  const amountZ = quintic(z - z0);
  const near = mix(latticeNoise(x0, z0, seed), latticeNoise(x0 + 1, z0, seed), amountX);
  const far = mix(latticeNoise(x0, z0 + 1, seed), latticeNoise(x0 + 1, z0 + 1, seed), amountX);
  return mix(near, far, amountZ);
}

function latticeNoise(x: number, z: number, seed: number): number {
  return avalanche32((Math.imul(x, 0x1f12_3bb5) ^ Math.imul(z, 0x5f35_6495) ^ seed) >>> 0) / 0xffff_ffff;
}

function avalanche32(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function quintic(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
