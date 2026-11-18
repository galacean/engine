import type { SeedWorldDetailDensityField } from "../runtime/SeedWorldPopulationPlan.ts";
import { groundCoverDensityReader } from "./SeedWorldGroundCoverExclusions";

/** Production density multiplier used by Runtime Detail compaction. */
export const SEED_WORLD_DETAIL_DENSITY_MULTIPLIER = 0.75;

export interface SeedWorldDetailCandidateLattice {
  readonly gridSide: number;
  readonly count: number;
  readonly densityPerSquareMetre: number;
  readonly cellSeed: number;
}

export interface SeedWorldDetailCandidate {
  readonly baseSeed: number;
  readonly worldX: number;
  readonly worldZ: number;
}

/** Canonical deterministic candidate lattice used by Runtime Detail compaction. */
export function createSeedWorldDetailCandidateLattice(
  field: SeedWorldDetailDensityField,
  densityMultiplier: number,
  cellX: number,
  cellZ: number,
  cellMetres: number
): SeedWorldDetailCandidateLattice {
  const gridSide = Math.max(
    1,
    Math.ceil(Math.sqrt(field.maximumDensityPerSquareMetre * Math.max(1, densityMultiplier) * cellMetres ** 2))
  );
  const count = gridSide ** 2;
  return Object.freeze({
    gridSide,
    count,
    densityPerSquareMetre: count / cellMetres ** 2,
    cellSeed:
      Math.imul(cellX, 0x9e37_79b9) ^
      Math.imul(cellZ, 0x85eb_ca6b) ^
      ((field.candidateSeed ?? field.hash) & 0x00ff_ffff)
  });
}

export function sampleSeedWorldDetailCandidate(
  lattice: SeedWorldDetailCandidateLattice,
  ordinal: number,
  minimumWorldX: number,
  minimumWorldZ: number,
  cellMetres: number
): SeedWorldDetailCandidate {
  const gridX = ordinal % lattice.gridSide;
  const gridZ = Math.floor(ordinal / lattice.gridSide);
  const baseSeed = hashSeedWorldDetailCandidate(ordinal ^ lattice.cellSeed);
  return Object.freeze({
    baseSeed,
    worldX:
      minimumWorldX + (gridX + seedWorldDetailUnitFloat(baseSeed ^ 0x68bc_21eb)) * (cellMetres / lattice.gridSide),
    worldZ: minimumWorldZ + (gridZ + seedWorldDetailUnitFloat(baseSeed ^ 0x02e5_be93)) * (cellMetres / lattice.gridSide)
  });
}

/**
 * Restrict evaluation to potentially occupied regions without changing canonical candidate ordinals.
 * @param lattice Stable lattice whose seed and density remain unchanged.
 * @param minimumWorldX Cell's minimum world X.
 * @param minimumWorldZ Cell's minimum world Z.
 * @param cellMetres Cell width and depth in metres.
 * @param hasContent Conservative area query: false must guarantee an empty rectangle.
 * @returns Sorted, disjoint [start, end) ordinal pairs, in the original generation order.
 */
export function createSeedWorldDetailCandidateRanges(
  lattice: SeedWorldDetailCandidateLattice,
  minimumWorldX: number,
  minimumWorldZ: number,
  cellMetres: number,
  hasContent: (minimumX: number, minimumZ: number, maximumX: number, maximumZ: number) => boolean
): Uint32Array {
  const tileSide = 16,
    gridSide = lattice.gridSide,
    spacing = cellMetres / gridSide;
  const ranges: number[] = [];
  for (let z = 0; z < gridSide; z += tileSide) {
    const zEnd = Math.min(gridSide, z + tileSide),
      columns: number[] = [];
    for (let x = 0; x < gridSide; x += tileSide) {
      const xEnd = Math.min(gridSide, x + tileSide);
      if (
        hasContent(
          minimumWorldX + x * spacing,
          minimumWorldZ + z * spacing,
          minimumWorldX + xEnd * spacing,
          minimumWorldZ + zEnd * spacing
        )
      )
        columns.push(x, xEnd);
    }
    for (let row = z; row < zEnd; row++)
      for (let i = 0; i < columns.length; i += 2) {
        const start = row * gridSide + columns[i],
          end = row * gridSide + columns[i + 1];
        if (ranges.length && ranges[ranges.length - 1] === start) ranges[ranges.length - 1] = end;
        else ranges.push(start, end);
      }
  }
  return Uint32Array.from(ranges);
}

export function seedWorldDetailCandidatePassesDensity(
  lattice: SeedWorldDetailCandidateLattice,
  baseSeed: number,
  densityPerSquareMetre: number
): boolean {
  if (densityPerSquareMetre <= 0) return false;
  return (
    seedWorldDetailUnitFloat(baseSeed ^ 0xa511_e9b3) <=
    densityPerSquareMetre / Math.max(lattice.densityPerSquareMetre, 0.000_001)
  );
}

export function sampleSeedWorldDetailDensity(
  field: SeedWorldDetailDensityField,
  worldSizeMetres: number,
  worldX: number,
  worldZ: number
): number {
  const read = groundCoverDensityReader(field);
  return sampleDetailDensity(
    read ? undefined : field.samples,
    read,
    field.resolution,
    field.maximumDensityPerSquareMetre,
    worldSizeMetres,
    worldX,
    worldZ
  );
}

/** Prepare immutable density access once for a compaction or entrance batch. Coordinates match the point query. */
export function createSeedWorldDetailDensitySampler(
  field: SeedWorldDetailDensityField,
  worldSizeMetres: number
): (worldX: number, worldZ: number) => number {
  const read = groundCoverDensityReader(field),
    samples = read ? undefined : field.samples;
  const { resolution, maximumDensityPerSquareMetre } = field;
  return (worldX, worldZ) =>
    sampleDetailDensity(samples, read, resolution, maximumDensityPerSquareMetre, worldSizeMetres, worldX, worldZ);
}

function sampleDetailDensity(
  samples: Uint8Array | undefined,
  read: ((x: number, z: number) => number) | undefined,
  resolution: number,
  maximumDensityPerSquareMetre: number,
  worldSizeMetres: number,
  worldX: number,
  worldZ: number
): number {
  const x = clamp(worldX / worldSizeMetres + 0.5, 0, 1) * resolution - 0.5;
  const z = clamp(worldZ / worldSizeMetres + 0.5, 0, 1) * resolution - 0.5;
  const x0 = clamp(Math.floor(x), 0, resolution - 1);
  const z0 = clamp(Math.floor(z), 0, resolution - 1);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const z1 = Math.min(resolution - 1, z0 + 1);
  const fractionX = clamp(x - x0, 0, 1);
  const fractionZ = clamp(z - z0, 0, 1);
  const i00 = z0 * resolution + x0,
    i10 = z0 * resolution + x1;
  const i01 = z1 * resolution + x0,
    i11 = z1 * resolution + x1;
  const near = read
    ? read(x0, z0) * (1 - fractionX) + read(x1, z0) * fractionX
    : samples![i00] * (1 - fractionX) + samples![i10] * fractionX;
  const far = read
    ? read(x0, z1) * (1 - fractionX) + read(x1, z1) * fractionX
    : samples![i01] * (1 - fractionX) + samples![i11] * fractionX;
  return ((near * (1 - fractionZ) + far * fractionZ) / 255) * maximumDensityPerSquareMetre;
}

/** Select a contributing density sample's owner, using the same pixel-centred footprint as generation. */
export function sampleSeedWorldDetailOwner(
  field: SeedWorldDetailDensityField,
  worldSizeMetres: number,
  worldX: number,
  worldZ: number
): string | undefined {
  if (!field.ownership) return undefined;
  const x = clamp(worldX / worldSizeMetres + 0.5, 0, 1) * field.resolution - 0.5;
  const z = clamp(worldZ / worldSizeMetres + 0.5, 0, 1) * field.resolution - 0.5;
  const owner = sampleDensityOwner(field, field.ownership.samples, field.resolution, x, z);
  return owner ? field.ownership.ids[owner - 1] : undefined;
}

/** Categorical resampling follows the strongest nonzero bilinear contribution; ties keep sample order.
 * Coordinates are in sample space so authoring's endpoint grid and runtime's pixel grid stay explicit.
 */
export function sampleDensityOwner(
  density: Uint8Array | SeedWorldDetailDensityField,
  owners: Uint32Array,
  resolution: number,
  x: number,
  z: number
): number {
  const field = density instanceof Uint8Array ? undefined : density;
  const read = field && groundCoverDensityReader(field);
  const samples = field ? (read ? undefined : field.samples) : (density as Uint8Array);
  const x0 = clamp(Math.floor(x), 0, resolution - 1),
    z0 = clamp(Math.floor(z), 0, resolution - 1);
  const x1 = Math.min(resolution - 1, x0 + 1),
    z1 = Math.min(resolution - 1, z0 + 1);
  const fx = clamp(x - x0, 0, 1),
    fz = clamp(z - z0, 0, 1);
  let owner = 0,
    strongest = 0;
  for (let corner = 0; corner < 4; corner++) {
    const index = (corner & 2 ? z1 : z0) * resolution + (corner & 1 ? x1 : x0);
    const value = read ? read(corner & 1 ? x1 : x0, corner & 2 ? z1 : z0) : samples![index];
    const contribution = value * (corner & 1 ? fx : 1 - fx) * (corner & 2 ? fz : 1 - fz);
    if (owners[index] && contribution > strongest) {
      owner = owners[index];
      strongest = contribution;
    }
  }
  return owner;
}

/** Ownership changes invalidate resident batches without reseeding their candidate positions. */
export function hashDetailOwnership(ownership: NonNullable<SeedWorldDetailDensityField["ownership"]>): number {
  let hash = 2166136261;
  for (const id of ownership.ids) {
    for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    hash = Math.imul(hash ^ 0, 16777619);
  }
  for (const owner of ownership.samples) hash = Math.imul(hash ^ owner, 16777619);
  return hash >>> 0;
}

export function hashSeedWorldDetailCandidate(input: number): number {
  let value = input >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  value = Math.imul(value, 0x7feb_352d) >>> 0;
  value = (value ^ (value >>> 15)) >>> 0;
  value = Math.imul(value, 0x846c_a68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

/** Endpoint-aligned ecology height field; position/width/density remain owned by their original parameters. */
export function sampleSeedWorldDetailHeight(
  field: SeedWorldDetailDensityField,
  worldSizeMetres: number,
  xMetres: number,
  zMetres: number,
  variation: number
): number | undefined {
  const heights = field.heightRangeMetres;
  if (!heights) return;
  const n = field.resolution,
    x = clamp(xMetres / worldSizeMetres, 0, 1) * (n - 1),
    z = clamp(zMetres / worldSizeMetres, 0, 1) * (n - 1);
  const x0 = Math.floor(x),
    z0 = Math.floor(z),
    x1 = Math.min(n - 1, x0 + 1),
    z1 = Math.min(n - 1, z0 + 1),
    fx = x - x0,
    fz = z - z0;
  const at = (ix: number, iz: number) => {
    const offset = (iz * n + ix) * 2;
    return heights.samples[offset] * (1 - variation) + heights.samples[offset + 1] * variation;
  };
  return (at(x0, z0) * (1 - fx) + at(x1, z0) * fx) * (1 - fz) + (at(x0, z1) * (1 - fx) + at(x1, z1) * fx) * fz;
}

export function seedWorldDetailUnitFloat(seed: number): number {
  return (hashSeedWorldDetailCandidate(seed) & 0x00ff_ffff) / 16_777_216;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
