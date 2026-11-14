import type { FarmWaterSupplyDiagnostics } from "./FarmWaterSupply";
import { freezeSnapshot } from "./FarmState";
import type { FarmSnapshot } from "./FarmState";

/** Ephemeral host input. Never part of the simulation signature or save schema. */
export interface FarmEnvironmentInput {
  readonly availability: "live" | "static-baseline";
  readonly season: string | null;
  readonly baseTemperatureCelsius: number | null;
  readonly snowing: boolean;
  readonly airTemperatureTenths: number;
  readonly lightUnits: number;
  readonly dayFactor: number | null;
  readonly cloudCoverage: number | null;
  readonly rainRate: number;
  /** Volumetric percentage points per simulation minute. Snow contributes zero. */
  readonly rainWaterPerMinute: number;
}
export interface FarmEnvironmentView extends FarmEnvironmentInput {
  readonly nearWater: FarmWaterSupplyDiagnostics | null;
  readonly agriculturalTimeMs: number;
  readonly simulatedTimeMs: number;
  readonly settledEnvironment: FarmSnapshot["environment"];
}
export function withFarmEnvironment(snapshot: FarmSnapshot, input?: FarmEnvironmentInput): FarmSnapshot {
  if (
    !input ||
    (snapshot.environment.airTemperatureTenths === input.airTemperatureTenths &&
      snapshot.environment.lightUnits === input.lightUnits)
  )
    return snapshot;
  return freezeSnapshot({
    ...snapshot,
    environment: {
      ...snapshot.environment,
      airTemperatureTenths: input.airTemperatureTenths,
      lightUnits: input.lightUnits
    }
  });
}
