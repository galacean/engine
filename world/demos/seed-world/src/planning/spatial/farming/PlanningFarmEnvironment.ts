import type { FarmEnvironmentInput } from "@galacean/engine-farming/farming/domain/FarmEnvironment";
import { terrainRainRateToMillimetresPerHour } from "@galacean/engine-environment/terrain/environment/SurfaceClimate";

export const FARM_SEASON_TEMPERATURES = Object.freeze({ spring: 20, summer: 26, autumn: 18, winter: 12 });
/** Gameplay coefficient: 8 mm/h ordinary rain supplies 2 percentage points per simulation minute. */
export const FARM_RAIN_WATER_COEFFICIENT = 0.25;
export interface PlanningFarmEnvironmentSource {
  readonly season: keyof typeof FARM_SEASON_TEMPERATURES;
  readonly dayFactor: number;
  readonly cloudCoverage: number;
  readonly rainRate: number;
  readonly snowRate: number;
}
export function planningFarmEnvironment(source?: PlanningFarmEnvironmentSource): FarmEnvironmentInput {
  const { season, dayFactor, cloudCoverage, rainRate, snowRate } = source ?? {
    season: "spring",
    dayFactor: 1,
    cloudCoverage: 0,
    rainRate: 0,
    snowRate: 0
  };
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const snowing = snowRate > 0;
  const baseTemperatureCelsius = FARM_SEASON_TEMPERATURES[season];
  return {
    availability: source ? "live" : "static-baseline",
    season,
    baseTemperatureCelsius,
    snowing,
    airTemperatureTenths: Math.round((snowing ? Math.min(baseTemperatureCelsius, 0) : baseTemperatureCelsius) * 10),
    lightUnits: Math.round(20 + 70 * clamp01(dayFactor) * (1 - 0.5 * clamp01(cloudCoverage))),
    dayFactor: clamp01(dayFactor),
    cloudCoverage: clamp01(cloudCoverage),
    rainRate: clamp01(rainRate),
    rainWaterPerMinute: snowing ? 0 : terrainRainRateToMillimetresPerHour(rainRate) * FARM_RAIN_WATER_COEFFICIENT
  };
}
