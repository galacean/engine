/** Look-owned response to semantic scene environment facts. */

export const WATER_LOOK_ENVIRONMENT_RESPONSE_SCHEMA_VERSION = 2 as const;

export interface WaterLookEnvironmentResponseV2 {
  readonly schemaVersion: typeof WATER_LOOK_ENVIRONMENT_RESPONSE_SCHEMA_VERSION;
  /** Additive roughness per unit of environment-provided unresolved normal variance. */
  readonly surfaceNormalVarianceToRoughness: number;
}

export type WaterLookEnvironmentResponseInputV2 = Omit<WaterLookEnvironmentResponseV2, "schemaVersion">;

function requireFiniteNonNegative(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${path} must be finite and non-negative.`);
  return value;
}

export function createWaterLookEnvironmentResponseV2(
  input: Readonly<WaterLookEnvironmentResponseInputV2>
): Readonly<WaterLookEnvironmentResponseV2> {
  return Object.freeze({
    schemaVersion: WATER_LOOK_ENVIRONMENT_RESPONSE_SCHEMA_VERSION,
    surfaceNormalVarianceToRoughness: requireFiniteNonNegative(
      input.surfaceNormalVarianceToRoughness,
      "$.surfaceNormalVarianceToRoughness"
    )
  });
}

export const NEUTRAL_WATER_LOOK_ENVIRONMENT_RESPONSE: Readonly<WaterLookEnvironmentResponseV2> =
  createWaterLookEnvironmentResponseV2({
    surfaceNormalVarianceToRoughness: 0
  });
