/** Runtime-only Lake level control exposed to Water DevTools without mutating Water authoring assets. */

export const LAKE_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND = "lake-water-level-runtime-v1" as const;

export interface LakeWaterLevelRuntimeReadback {
  readonly bodyId: string;
  /** Immutable Hydrology/authoring ceiling. Runtime water may return to this level but never exceed it. */
  readonly canonicalWaterLevelMetres: number;
  /** Lowest useful runtime level; at this level the deepest authored sample is dry. */
  readonly minimumWaterLevelMetres: number;
  /** Inclusive runtime ceiling, currently identical to the canonical Hydrology level. */
  readonly maximumWaterLevelMetres: number;
  readonly effectiveWaterLevelMetres: number;
  readonly surfaceLevelOffsetMetres: number;
}

export interface LakeWaterLevelRuntimeDevelopmentPort {
  readonly kind: typeof LAKE_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND;
  readonly readback: Readonly<LakeWaterLevelRuntimeReadback>;
  /** Applies one absolute world-space Lake level and returns the clamped effective readback. */
  setWaterLevelMetres(waterLevelMetres: number): Readonly<LakeWaterLevelRuntimeReadback>;
}

export function isLakeWaterLevelRuntimeDevelopmentPort(
  value: unknown
): value is Readonly<LakeWaterLevelRuntimeDevelopmentPort> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LakeWaterLevelRuntimeDevelopmentPort>;
  return (
    candidate.kind === LAKE_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND &&
    typeof candidate.setWaterLevelMetres === "function" &&
    typeof candidate.readback === "object" &&
    candidate.readback !== null
  );
}
