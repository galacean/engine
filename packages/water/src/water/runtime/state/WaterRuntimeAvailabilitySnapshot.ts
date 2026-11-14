/** Change-driven runtime service availability; no Engine resources are owned by this snapshot. */
import { createWaterRevision, type WaterRevision } from "../../authoring/identity/WaterIdentity";
import type { WaterReflectionPolicyMode } from "../../authoring/optics/WaterReflectionPolicy";

export const WATER_RUNTIME_AVAILABILITY_SCHEMA_VERSION = 2 as const;

export interface WaterRuntimeAvailabilitySnapshot {
  readonly schemaVersion: typeof WATER_RUNTIME_AVAILABILITY_SCHEMA_VERSION;
  readonly revision: WaterRevision<"water-runtime-availability">;
  readonly reflectionBindingRevision: WaterRevision<"water-reflection-binding">;
  readonly sceneColor: boolean;
  readonly sceneDepth: boolean;
  readonly environmentReflection: boolean;
  readonly screenSpaceReflection: boolean;
  /** Actual source resolved by the current reflection binding. */
  readonly resolvedReflectionSource: WaterReflectionPolicyMode;
}

export interface WaterRuntimeAvailabilitySnapshotInput {
  readonly revision: number;
  readonly reflectionBindingRevision: number;
  readonly sceneColor: boolean;
  readonly sceneDepth: boolean;
  readonly environmentReflection: boolean;
  readonly screenSpaceReflection: boolean;
  readonly resolvedReflectionSource: WaterReflectionPolicyMode;
}

const WATER_REFLECTION_MODES = new Set<WaterReflectionPolicyMode>(["environment", "ssr", "analytic"]);

export function createWaterRuntimeAvailabilitySnapshot(
  input: Readonly<WaterRuntimeAvailabilitySnapshotInput>
): Readonly<WaterRuntimeAvailabilitySnapshot> {
  for (const key of ["sceneColor", "sceneDepth", "environmentReflection", "screenSpaceReflection"] as const) {
    if (typeof input[key] !== "boolean") throw new TypeError(`$.${key} must be boolean.`);
  }
  if (!WATER_REFLECTION_MODES.has(input.resolvedReflectionSource)) {
    throw new TypeError("$.resolvedReflectionSource must be a valid Water reflection mode.");
  }
  return Object.freeze({
    schemaVersion: WATER_RUNTIME_AVAILABILITY_SCHEMA_VERSION,
    revision: createWaterRevision<"water-runtime-availability">(input.revision, "$.revision"),
    reflectionBindingRevision: createWaterRevision<"water-reflection-binding">(
      input.reflectionBindingRevision,
      "$.reflectionBindingRevision"
    ),
    sceneColor: input.sceneColor,
    sceneDepth: input.sceneDepth,
    environmentReflection: input.environmentReflection,
    screenSpaceReflection: input.screenSpaceReflection,
    resolvedReflectionSource: input.resolvedReflectionSource
  });
}
