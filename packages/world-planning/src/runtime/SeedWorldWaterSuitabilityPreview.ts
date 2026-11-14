import type { SeedWorldPlan } from "../world/SeedWorldPlanner.ts";
import { SEED_WORLD_LAKE_LAYOUT_PROFILE } from "@galacean/engine-water/world/SeedWorldLakeLayoutProfile";
import { compileSeedWorldGeologyHeightfield } from "./SeedWorldGeologyLayout.ts";

/** Fixed bank support used by the first water-layout diagnostic. */
export const SEED_WORLD_WATER_SUITABILITY_BANK_SUPPORT_METRES = SEED_WORLD_LAKE_LAYOUT_PROFILE.bankSupportMetres;

/** Cached dry-terrain eligibility used by Hydrology and its 2D diagnostic. */
export interface SeedWorldWaterSuitabilityPreview {
  /** Raster width and height. */
  readonly resolution: number;
  /** World edge length represented by the raster. */
  readonly sizeMetres: number;
  /** Required dry-terrain support outside the future water boundary. */
  readonly bankSupportMetres: number;
  /** Continuous suitability in `[0, 255]`; zero is unavailable. */
  readonly suitability: Uint8Array;
  /** Binary diagnostic threshold over `suitability`. */
  readonly availableMask: Uint8Array;
  /** Stable evidence over the Seed, support distance, and both emitted rasters. */
  readonly hash: number;
}

/**
 * Compiles a deterministic soft-bank suitability field from the dry terrain plan.
 * High ground and hill bodies are excluded before Hydrology searches for basins, so a locally flat summit cannot become a lake candidate.
 * @param plan Dry terrain plan generated from one Root Seed.
 * @param bankSupportMetres Required low-relief support outside a prospective shoreline.
 * @returns One cached suitability field for comparing planned water against viable terrain.
 * @throws {RangeError} When the support distance cannot be represented by the plan grid.
 */
export function compileSeedWorldWaterSuitabilityPreview(
  plan: Pick<
    SeedWorldPlan,
    "rootSeed" | "stageSeeds" | "resolution" | "sizeMetres" | "landMask" | "height" | "slope" | "geologyLayout"
  >,
  bankSupportMetres = SEED_WORLD_WATER_SUITABILITY_BANK_SUPPORT_METRES
): SeedWorldWaterSuitabilityPreview {
  if (!Number.isFinite(bankSupportMetres) || bankSupportMetres <= 0 || bankSupportMetres >= plan.sizeMetres * 0.25) {
    throw new RangeError("Seed World water suitability requires a finite local bank support distance.");
  }
  const resolution = plan.resolution;
  const expectedLength = resolution * resolution;
  if (
    resolution < 4 ||
    plan.landMask.length !== expectedLength ||
    plan.height.length !== expectedLength ||
    plan.slope.length !== expectedLength
  ) {
    throw new RangeError("Seed World water suitability requires matching square planning rasters.");
  }

  const spacingMetres = plan.sizeMetres / (resolution - 1);
  const supportRadiusCells = Math.max(1, Math.ceil(bankSupportMetres / spacingMetres));
  const landClearance = compileLandClearance(plan.landMask, resolution);
  const geologyField = plan.geologyLayout
    ? compileSeedWorldGeologyHeightfield(plan.geologyLayout, resolution)
    : undefined;
  const height = geologyField?.heights ?? plan.height;
  const localRelief = compileLocalRelief(height, resolution, supportRadiusCells);
  const elevationSupport = plan.geologyLayout ? compileLandElevationSupport(height, plan.landMask) : undefined;
  const maximumPhysicalSlopeDegrees =
    (Math.atan(SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumShorelineCutMetres / bankSupportMetres) * 180) / Math.PI;
  const suitability = new Uint8Array(expectedLength);
  const availableMask = new Uint8Array(expectedLength);
  const noiseSeed = mixUint32(plan.rootSeed ^ 0x7761_7465);

  let hash = hashUint32(0x811c_9dc5, plan.rootSeed);
  hash = hashUint32(hash, Math.round(bankSupportMetres * 1_000));
  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      const index = row * resolution + column;
      if (plan.landMask[index] === 0 || landClearance[index]! < supportRadiusCells) {
        hash = hashUint32(hash, 0);
        continue;
      }
      const coastSupport = smootherstep(supportRadiusCells, supportRadiusCells * 2.5, landClearance[index]!);
      const slopeSupport = geologyField
        ? 1 -
          smootherstep(
            maximumPhysicalSlopeDegrees * 0.5,
            maximumPhysicalSlopeDegrees,
            geologyField.slopesDegrees[index]!
          )
        : 1 - smootherstep(0.12, 0.58, plan.slope[index]!);
      const reliefSupport = geologyField
        ? 1 -
          smootherstep(
            SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumShorelineCutMetres * 0.5,
            SEED_WORLD_LAKE_LAYOUT_PROFILE.maximumShorelineCutMetres,
            localRelief[index]!
          )
        : 1 - smootherstep(0.035, 0.22, localRelief[index]!);
      const hillBodySupport = plan.geologyLayout
        ? sampleHillBodySupport(plan.geologyLayout, column, row, resolution)
        : 1;
      const regionalNoise = 0.68 + 0.32 * fractalNoise(column, row, noiseSeed);
      const score =
        coastSupport *
        slopeSupport *
        reliefSupport *
        (elevationSupport?.[index] ?? 1) *
        hillBodySupport *
        regionalNoise;
      const encoded = Math.round(Math.min(1, Math.max(0, score)) * 255);
      suitability[index] = encoded;
      availableMask[index] = encoded >= 24 ? 1 : 0;
      hash = hashUint32(hash, encoded | (availableMask[index]! << 8));
    }
  }

  return Object.freeze({
    resolution,
    sizeMetres: plan.sizeMetres,
    bankSupportMetres,
    suitability,
    availableMask,
    hash: hash >>> 0
  });
}

function compileLandElevationSupport(height: Float32Array, landMask: Uint8Array): Float32Array {
  const landHeights = Array.from(height)
    .filter((_, index) => landMask[index] !== 0)
    .sort((left, right) => left - right);
  const lower = quantile(landHeights, 0.72);
  const upper = Math.max(lower + 1e-4, quantile(landHeights, 0.9));
  return Float32Array.from(height, (sample, index) =>
    landMask[index] === 0 ? 0 : 1 - smootherstep(lower, upper, sample)
  );
}

function sampleHillBodySupport(
  layout: NonNullable<SeedWorldPlan["geologyLayout"]>,
  column: number,
  row: number,
  resolution: number
): number {
  const worldX = (column / (resolution - 1) - 0.5) * layout.worldSizeMetres;
  const worldZ = (row / (resolution - 1) - 0.5) * layout.worldSizeMetres;
  let nearestBodyDistance = Number.POSITIVE_INFINITY;
  for (const hill of layout.hills) {
    const deltaX = worldX - hill.center.x;
    const deltaZ = worldZ - hill.center.z;
    const cosine = Math.cos(hill.rotationRadians);
    const sine = Math.sin(hill.rotationRadians);
    const localX = deltaX * cosine + deltaZ * sine;
    const localZ = -deltaX * sine + deltaZ * cosine;
    nearestBodyDistance = Math.min(
      nearestBodyDistance,
      Math.hypot(localX / hill.bodyRadiusMetres.major, localZ / hill.bodyRadiusMetres.minor)
    );
  }
  return smootherstep(0.45, 0.75, nearestBodyDistance);
}

function quantile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index]!;
}

function compileLandClearance(landMask: Uint8Array, resolution: number): Uint16Array {
  const distance = new Uint16Array(landMask.length);
  distance.fill(0xffff);
  const queue = new Int32Array(landMask.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < landMask.length; index++) {
    if (landMask[index] !== 0) continue;
    distance[index] = 0;
    queue[tail++] = index;
  }
  while (head < tail) {
    const current = queue[head++]!;
    const x = current % resolution;
    const y = Math.floor(current / resolution);
    const nextDistance = distance[current]! + 1;
    for (const [offsetX, offsetY] of CARDINAL_NEIGHBORS) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= resolution || nextY >= resolution) continue;
      const next = nextY * resolution + nextX;
      if (distance[next]! <= nextDistance) continue;
      distance[next] = nextDistance;
      queue[tail++] = next;
    }
  }
  return distance;
}

function compileLocalRelief(height: Float32Array, resolution: number, radius: number): Float32Array {
  const relief = new Float32Array(height.length);
  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = Number.NEGATIVE_INFINITY;
      for (let offsetY = -radius; offsetY <= radius; offsetY++) {
        const sampleY = row + offsetY;
        if (sampleY < 0 || sampleY >= resolution) continue;
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
          const sampleX = column + offsetX;
          if (sampleX < 0 || sampleX >= resolution) continue;
          const sample = height[sampleY * resolution + sampleX]!;
          minimum = Math.min(minimum, sample);
          maximum = Math.max(maximum, sample);
        }
      }
      relief[row * resolution + column] = maximum - minimum;
    }
  }
  return relief;
}

function fractalNoise(x: number, y: number, seed: number): number {
  let value = 0;
  let weight = 0;
  let amplitude = 1;
  for (const wavelengthCells of [18, 9, 4.5]) {
    value += valueNoise(x / wavelengthCells, y / wavelengthCells, seed) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    seed = mixUint32(seed ^ 0x9e37_79b9);
  }
  return value / weight;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smootherstep(0, 1, x - x0);
  const ty = smootherstep(0, 1, y - y0);
  const top = mix(hash01(x0, y0, seed), hash01(x0 + 1, y0, seed), tx);
  const bottom = mix(hash01(x0, y0 + 1, seed), hash01(x0 + 1, y0 + 1, seed), tx);
  return mix(top, bottom, ty);
}

function hash01(x: number, y: number, seed: number): number {
  return mixUint32(seed ^ Math.imul(x, 0x9e37_79b1) ^ Math.imul(y, 0x85eb_ca77)) / 0x1_0000_0000;
}

function hashUint32(hash: number, value: number): number {
  return Math.imul((hash ^ (value >>> 0)) >>> 0, 0x0100_0193) >>> 0;
}

function mixUint32(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mix(left: number, right: number, ratio: number): number {
  return left + (right - left) * ratio;
}

const CARDINAL_NEIGHBORS = Object.freeze([
  Object.freeze([1, 0] as const),
  Object.freeze([-1, 0] as const),
  Object.freeze([0, 1] as const),
  Object.freeze([0, -1] as const)
]);
