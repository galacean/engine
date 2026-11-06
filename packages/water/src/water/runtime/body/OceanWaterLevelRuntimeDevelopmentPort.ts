/** Runtime-only Ocean level control exposed to Water DevTools without mutating Water authoring assets. */

export const OCEAN_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND = "ocean-water-level-runtime-v1" as const;

export interface OceanWaterLevelRuntimeReadback {
  readonly bodyId: string;
  /** Immutable generated water datum used when the runtime state is created or reset. */
  readonly defaultWaterLevelMetres: number;
  readonly minimumWaterLevelMetres: number;
  readonly maximumWaterLevelMetres: number;
  readonly effectiveWaterLevelMetres: number;
  readonly surfaceLevelOffsetMetres: number;
}

export interface OceanWaterLevelRuntimeDevelopmentPort {
  readonly kind: typeof OCEAN_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND;
  readonly readback: Readonly<OceanWaterLevelRuntimeReadback>;
  /** Applies one absolute world-space Ocean level and returns the clamped effective readback. */
  setWaterLevelMetres(waterLevelMetres: number): Readonly<OceanWaterLevelRuntimeReadback>;
}

export function isOceanWaterLevelRuntimeDevelopmentPort(
  value: unknown
): value is Readonly<OceanWaterLevelRuntimeDevelopmentPort> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<OceanWaterLevelRuntimeDevelopmentPort>;
  return (
    candidate.kind === OCEAN_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND &&
    typeof candidate.setWaterLevelMetres === "function" &&
    typeof candidate.readback === "object" &&
    candidate.readback !== null
  );
}
