/** Stable registry identity for an engine-object-free reflection policy. */
import { hashStableValue } from "../../compiler/shared/determinism";
import { normalizeWaterReflectionPolicy, type WaterReflectionPolicy } from "./WaterReflectionPolicy";

export const WATER_REFLECTION_POLICY_PRESET_SCHEMA_VERSION = 1 as const;

export interface WaterReflectionPolicyPresetV1 {
  readonly schemaVersion: typeof WATER_REFLECTION_POLICY_PRESET_SCHEMA_VERSION;
  readonly id: string;
  readonly policy: WaterReflectionPolicy;
}

export function createWaterReflectionPolicyPresetV1(
  id: string,
  policy: Readonly<WaterReflectionPolicy>
): Readonly<WaterReflectionPolicyPresetV1> {
  if (id.trim().length === 0) throw new TypeError("Water reflection-policy preset id must be non-empty.");
  return Object.freeze({
    schemaVersion: WATER_REFLECTION_POLICY_PRESET_SCHEMA_VERSION,
    id,
    policy: normalizeWaterReflectionPolicy(policy)
  });
}

export function computeWaterReflectionPolicyPresetContentHash(preset: Readonly<WaterReflectionPolicyPresetV1>): string {
  return hashStableValue(preset);
}
