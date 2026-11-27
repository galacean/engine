/** Engine-object-free, change-driven environment facts consumed by Water state resolution. */
import { createWaterRevision, type WaterRevision } from "../identity/WaterIdentity";

export const WATER_ENVIRONMENT_SNAPSHOT_SCHEMA_VERSION = 2 as const;

export interface WaterEnvironmentSnapshot {
  readonly schemaVersion: typeof WATER_ENVIRONMENT_SNAPSHOT_SCHEMA_VERSION;
  readonly revision: WaterRevision<"water-environment">;
  readonly surfaceNormalVariance: number;
}

export interface WaterEnvironmentSnapshotInput {
  readonly revision: number;
  readonly surfaceNormalVariance: number;
}

function requireFiniteNonNegative(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${path} must be finite and non-negative.`);
  return value;
}

export function createWaterEnvironmentSnapshot(
  input: Readonly<WaterEnvironmentSnapshotInput>
): Readonly<WaterEnvironmentSnapshot> {
  return Object.freeze({
    schemaVersion: WATER_ENVIRONMENT_SNAPSHOT_SCHEMA_VERSION,
    revision: createWaterRevision<"water-environment">(input.revision, "$.revision"),
    surfaceNormalVariance: requireFiniteNonNegative(input.surfaceNormalVariance, "$.surfaceNormalVariance")
  });
}

export const DEFAULT_WATER_ENVIRONMENT_SNAPSHOT: Readonly<WaterEnvironmentSnapshot> = createWaterEnvironmentSnapshot({
  revision: 0,
  surfaceNormalVariance: 0
});
