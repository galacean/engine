import type { FarmingSimulationConfig } from "../config/FarmingSimulationConfig";
import type { SoilProfileDefinition } from "./FarmDefinitions";

/** Material-only dry-to-saturated blend. Domain values remain volumetric percentage points. */
export function normalizeSoilMoisture(soil: SoilProfileDefinition, moistureUnits: number): number {
  return Math.max(
    0,
    Math.min(1, (moistureUnits - soil.minimumMoistureUnits) / (soil.maximumMoistureUnits - soil.minimumMoistureUnits))
  );
}

/** Constant wet-stage loss followed by exponential drying toward the model's dry limit. */
export function evaporateSoilMoisture(
  moistureUnits: number,
  water: FarmingSimulationConfig["water"],
  elapsedMinutes: number
): number {
  const rate = soilEvaporationPerMinute(water.capacity, water);
  if (rate === 0 || moistureUnits <= water.minimumMoisture || elapsedMinutes <= 0) return moistureUnits;
  let moisture = moistureUnits;
  let remainingMinutes = elapsedMinutes;
  if (moisture > water.evaporationSlowdownThreshold) {
    const loss = Math.min(moisture - water.evaporationSlowdownThreshold, rate * remainingMinutes);
    moisture -= loss;
    remainingMinutes = Math.max(0, remainingMinutes - loss / rate);
  }
  const dryingRange = water.evaporationSlowdownThreshold - water.minimumMoisture;
  if (remainingMinutes > 0 && dryingRange > 0) {
    moisture =
      water.minimumMoisture + (moisture - water.minimumMoisture) * Math.exp((-rate * remainingMinutes) / dryingRange);
  }
  return Math.max(water.minimumMoisture, moisture);
}

export interface SoilWaterRates {
  readonly rainWaterPerMinute: number;
  readonly nearWaterPerMinute: number;
  readonly evaporationPerMinute: number;
}

/** Instantaneous rates for the current input, not the previous step's actual balance. */
export function soilWaterRates(
  moistureUnits: number,
  water: FarmingSimulationConfig["water"],
  rainWaterPerMinute = 0,
  nearWaterPerMinute = 0
): SoilWaterRates {
  return Object.freeze({
    rainWaterPerMinute: Math.max(0, rainWaterPerMinute),
    nearWaterPerMinute: Math.max(0, nearWaterPerMinute),
    evaporationPerMinute: soilEvaporationPerMinute(moistureUnits, water)
  });
}

/** Keep the existing analytic drying curve and apply rain in the same fixed step. */
export function settleSoilMoisture(
  moistureUnits: number,
  water: FarmingSimulationConfig["water"],
  elapsedMinutes: number,
  rainWaterPerMinute = 0,
  nearWaterPerMinute = 0
): number {
  return Math.max(
    water.minimumMoisture,
    Math.min(
      water.capacity,
      evaporateSoilMoisture(moistureUnits, water, elapsedMinutes) +
        (Math.max(0, rainWaterPerMinute) + Math.max(0, nearWaterPerMinute)) * elapsedMinutes
    )
  );
}

/** Analytic drying curve's instantaneous derivative, shared by simulation and query. */
export function soilEvaporationPerMinute(moistureUnits: number, water: FarmingSimulationConfig["water"]): number {
  if (moistureUnits <= water.minimumMoisture) return 0;
  const dryingRange = water.evaporationSlowdownThreshold - water.minimumMoisture;
  return (
    water.evaporationPerMinute *
    Math.max(0, Math.min(1, dryingRange > 0 ? (moistureUnits - water.minimumMoisture) / dryingRange : 1))
  );
}
