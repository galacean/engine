import type { SeedWorldDetailDensityField } from "../runtime/SeedWorldPopulationPlan.ts";
import { createSeedWorldDetailDensitySampler } from "./SeedWorldDetailCandidateLattice";

/** Published Detail transforms and density snapshots used to identify newly added instances. */
export interface SeedWorldDetailEntranceOptions {
  /** Compacted transforms containing position at offsets 0–2 and vertical scale at offset 5. */
  readonly transforms: Float32Array;
  /** Number of populated transform records; unused buffer capacity is ignored. */
  readonly instanceCount: number;
  /** Number of floats between consecutive transform records. */
  readonly recordFloats: number;
  /** Asset-space lower Y bound before per-instance scaling. */
  readonly localMinimumY: number;
  /** Asset-space upper Y bound before per-instance scaling. */
  readonly localMaximumY: number;
  /** Width and depth of the square density field in world metres. */
  readonly worldSizeMetres: number;
  /** Density field of the same species before the edit; absence means zero previous density. */
  readonly previousField?: SeedWorldDetailDensityField;
  /** Density field of the species being published. */
  readonly field: SeedWorldDetailDensityField;
  /** Previously published positions for this species, encoded with {@link positionKey}. */
  readonly previousPositions?: ReadonlySet<string>;
}

/**
 * Encodes a world-space X-Z position at the precision retained by instance transform buffers.
 * @param x - World X coordinate in metres.
 * @param z - World Z coordinate in metres.
 * @returns Stable key shared by retained positions and compacted transforms.
 */
export function positionKey(x: number, z: number): string {
  return `${Math.fround(x)},${Math.fround(z)}`;
}

/**
 * Builds per-instance bottom-up reveal ranges, marking only new positions where physical density increased.
 * @param options - Compacted instance transforms, asset bounds, and before/after density snapshots.
 * @returns Three floats per instance: reveal mask (zero or one), world origin Y, and height in metres;
 * `null` when no instance requires an entrance effect. Inputs remain unchanged.
 */
export function createSeedWorldDetailEntranceRecords(options: SeedWorldDetailEntranceOptions): Float32Array | null {
  const {
    transforms,
    instanceCount,
    recordFloats,
    localMinimumY,
    localMaximumY,
    worldSizeMetres,
    previousField,
    field,
    previousPositions
  } = options;
  const records = new Float32Array(instanceCount * 3);
  // Each independently normalized R8 field contributes at most half of its physical-density step.
  const quantizationTolerance =
    (field.maximumDensityPerSquareMetre + (previousField?.maximumDensityPerSquareMetre ?? 0)) / 510;
  const sampleDensity = createSeedWorldDetailDensitySampler(field, worldSizeMetres);
  const samplePreviousDensity = previousField && createSeedWorldDetailDensitySampler(previousField, worldSizeMetres);
  let hasEntrance = false;
  for (let instance = 0; instance < instanceCount; instance++) {
    const transformOffset = instance * recordFloats;
    const revealOffset = instance * 3;
    const worldX = transforms[transformOffset]!;
    const worldZ = transforms[transformOffset + 2]!;
    const scaleY = transforms[transformOffset + 5]!;
    records[revealOffset + 1] = transforms[transformOffset + 1]! + localMinimumY * scaleY;
    records[revealOffset + 2] = Math.max(0.001, (localMaximumY - localMinimumY) * scaleY);
    if (previousPositions?.has(positionKey(worldX, worldZ))) continue;
    const density = sampleDensity(worldX, worldZ);
    const previousDensity = samplePreviousDensity ? samplePreviousDensity(worldX, worldZ) : 0;
    const roundingTolerance = Number.EPSILON * Math.max(density, previousDensity);
    if (density - previousDensity > quantizationTolerance + roundingTolerance) {
      records[revealOffset] = 1;
      hasEntrance = true;
    }
  }
  return hasEntrance ? records : null;
}
