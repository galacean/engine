import type { WeatherPrecipitationState, WeatherWindState } from "@galacean/engine";

/** Physical rain rate assigned to the ordinary-rain weather preset. */
export const TERRAIN_RAIN_PRESET_MILLIMETRES_PER_HOUR = 8;

/** Physical rain rate assigned to the heavy-rain weather preset. */
export const TERRAIN_HEAVY_RAIN_PRESET_MILLIMETRES_PER_HOUR = 32;

/** Simulated hydrology seconds advanced by one real-time second. */
export const TERRAIN_SURFACE_HYDROLOGY_TIME_SCALE = 30;

/** Snowmelt simulation seconds per real-time second; snowfall accumulation keeps its authored rate. */
export const TERRAIN_SURFACE_SNOW_MELT_TIME_SCALE = 3;

export const TERRAIN_RAIN_PRESET_NORMALIZED_RATE = 0.72;
const DEFAULT_PUDDLE_STORAGE_CAPACITY_MILLIMETRES = 1.5;
const DEFAULT_PUDDLE_MAXIMUM_AREA_FRACTION = 0.06;
const SURFACE_MOISTURE_CAPACITY_MILLIMETRES = 0.8;
const IMPERVIOUS_RUNOFF_FRACTION = 0.18;
const DRY_SOIL_INFILTRATION_MILLIMETRES_PER_HOUR = 12;
const SATURATED_SOIL_INFILTRATION_MILLIMETRES_PER_HOUR = 2;

/** Persistent terrain-surface state left behind by transient weather. */
export interface TerrainSurfaceClimateState {
  readonly wetness: number;
  readonly puddles: number;
  readonly puddleWaterMillimetres: number;
  readonly snowCover: number;
}

/** Mutable state retained by the environment runtime. */
export type MutableTerrainSurfaceClimateState = {
  -readonly [Key in keyof TerrainSurfaceClimateState]: TerrainSurfaceClimateState[Key];
};

/** Inputs from the astronomical cycle that influence evaporation and melting. */
export interface TerrainSurfaceClimateContext {
  readonly dayFactor: number;
  readonly deltaTime: number;
  readonly puddleStorageCapacityMillimetres?: number;
  readonly puddleMaximumAreaFraction?: number;
}

/** Creates a dry surface-climate state. */
export function createTerrainSurfaceClimateState(): MutableTerrainSurfaceClimateState {
  return { wetness: 0, puddles: 0, puddleWaterMillimetres: 0, snowCover: 0 };
}

/** Converts the normalized weather channel into an explicit surface rainfall rate. */
export function terrainRainRateToMillimetresPerHour(rainRate: number): number {
  const normalizedRate = clamp01(rainRate);
  if (normalizedRate <= TERRAIN_RAIN_PRESET_NORMALIZED_RATE) {
    return (normalizedRate / TERRAIN_RAIN_PRESET_NORMALIZED_RATE) * TERRAIN_RAIN_PRESET_MILLIMETRES_PER_HOUR;
  }
  const heavyBlend = (normalizedRate - TERRAIN_RAIN_PRESET_NORMALIZED_RATE) / (1 - TERRAIN_RAIN_PRESET_NORMALIZED_RATE);
  return mix(TERRAIN_RAIN_PRESET_MILLIMETRES_PER_HOUR, TERRAIN_HEAVY_RAIN_PRESET_MILLIMETRES_PER_HOUR, heavyBlend);
}

/** Maps the ordinary-rain channel to a reversible 0-1 puddle-presentation fade. */
export function resolveTerrainRainSurfaceVisibility(rainRate: number): number {
  return clamp01(rainRate / TERRAIN_RAIN_PRESET_NORMALIZED_RATE);
}

/**
 * Advances persistent wetness, puddles, and snow from precipitation, wind, and daylight.
 * Rainfall, infiltration, retained water, drainage, and evaporation share millimetre units; the
 * explicit time scale only accelerates the same mass balance for interactive authoring.
 */
export function advanceTerrainSurfaceClimate(
  state: MutableTerrainSurfaceClimateState,
  precipitation: Readonly<WeatherPrecipitationState>,
  wind: number | Readonly<WeatherWindState>,
  context: Readonly<TerrainSurfaceClimateContext>
): MutableTerrainSurfaceClimateState {
  if (!Number.isFinite(context.deltaTime) || context.deltaTime < 0) {
    throw new RangeError("Terrain surface-climate delta time must be finite and non-negative");
  }
  if (
    context.puddleStorageCapacityMillimetres !== undefined &&
    (!Number.isFinite(context.puddleStorageCapacityMillimetres) || context.puddleStorageCapacityMillimetres < 0)
  ) {
    throw new RangeError("Terrain puddle storage capacity must be finite and non-negative");
  }
  if (
    context.puddleMaximumAreaFraction !== undefined &&
    (!Number.isFinite(context.puddleMaximumAreaFraction) ||
      context.puddleMaximumAreaFraction < 0 ||
      context.puddleMaximumAreaFraction > 1)
  ) {
    throw new RangeError("Terrain puddle maximum area fraction must be finite and within [0, 1]");
  }
  const windSpeedMps = typeof wind === "number" ? wind : wind.forceMultiplier * 5;
  if (!Number.isFinite(windSpeedMps) || windSpeedMps < 0) {
    throw new RangeError("Terrain surface-climate wind speed must be finite and non-negative");
  }
  if (
    precipitation.rainRate === 0 &&
    precipitation.snowRate === 0 &&
    state.wetness === 0 &&
    state.puddles === 0 &&
    state.puddleWaterMillimetres === 0 &&
    state.snowCover === 0
  ) {
    return state;
  }
  const deltaTime = Math.min(context.deltaTime, 0.25);
  const simulatedHours = (deltaTime * TERRAIN_SURFACE_HYDROLOGY_TIME_SCALE) / 3600;
  const daylight = clamp01(context.dayFactor);
  const windDrying = Math.min(windSpeedMps, 12) / 12;
  const warmth = clamp01((precipitation.temperatureCelsius + 5) / 30);
  const potentialEvaporationMillimetresPerHour =
    (0.04 + daylight * 0.12 + warmth * 0.08 + windDrying * 0.08) * (1 - clamp01(precipitation.relativeHumidity) * 0.82);
  const melt =
    clamp01((precipitation.temperatureCelsius + 1) / 9) *
    (0.012 + daylight * 0.026) *
    TERRAIN_SURFACE_SNOW_MELT_TIME_SCALE;
  const meltedSnow = state.snowCover * melt * deltaTime;
  const rainfallMillimetres = terrainRainRateToMillimetresPerHour(precipitation.rainRate) * simulatedHours;
  const perviousRainfallMillimetres = rainfallMillimetres * (1 - IMPERVIOUS_RUNOFF_FRACTION);
  const infiltrationRateMillimetresPerHour = mix(
    DRY_SOIL_INFILTRATION_MILLIMETRES_PER_HOUR,
    SATURATED_SOIL_INFILTRATION_MILLIMETRES_PER_HOUR,
    state.wetness
  );
  const surfaceMoistureMillimetres = state.wetness * SURFACE_MOISTURE_CAPACITY_MILLIMETRES;
  const moistureDeficitMillimetres = SURFACE_MOISTURE_CAPACITY_MILLIMETRES - surfaceMoistureMillimetres;
  const infiltratedMillimetres = Math.min(
    perviousRainfallMillimetres,
    infiltrationRateMillimetresPerHour * simulatedHours,
    moistureDeficitMillimetres
  );
  const surfaceEvaporationMillimetres = Math.min(
    surfaceMoistureMillimetres + infiltratedMillimetres,
    potentialEvaporationMillimetresPerHour * simulatedHours
  );

  state.wetness = clamp01(
    (surfaceMoistureMillimetres + infiltratedMillimetres - surfaceEvaporationMillimetres) /
      SURFACE_MOISTURE_CAPACITY_MILLIMETRES +
      meltedSnow * 0.75
  );

  const runoffMillimetres =
    rainfallMillimetres * IMPERVIOUS_RUNOFF_FRACTION +
    Math.max(perviousRainfallMillimetres - infiltratedMillimetres, 0);
  const storageCapacityMillimetres =
    context.puddleStorageCapacityMillimetres ?? DEFAULT_PUDDLE_STORAGE_CAPACITY_MILLIMETRES;
  if (storageCapacityMillimetres > 0) {
    const retainedWaterMillimetres = Math.min(state.puddleWaterMillimetres, storageCapacityMillimetres);
    const storage = clamp01(retainedWaterMillimetres / storageCapacityMillimetres);
    const drainageFractionPerHour = mix(0.18, 1, storage);
    const drainageMillimetres = retainedWaterMillimetres * drainageFractionPerHour * simulatedHours;
    const maximumAreaFraction = context.puddleMaximumAreaFraction ?? DEFAULT_PUDDLE_MAXIMUM_AREA_FRACTION;
    const evaporationMillimetres =
      potentialEvaporationMillimetresPerHour * maximumAreaFraction * storage * simulatedHours;
    state.puddleWaterMillimetres = Math.min(
      Math.max(retainedWaterMillimetres + runoffMillimetres - drainageMillimetres - evaporationMillimetres, 0),
      storageCapacityMillimetres
    );
    state.puddles = clamp01(state.puddleWaterMillimetres / storageCapacityMillimetres);
  } else {
    state.puddleWaterMillimetres = 0;
    state.puddles = 0;
  }

  const snowAccumulation = precipitation.snowRate * (1 - state.snowCover) * 0.12;
  const rainWash = precipitation.rainRate * state.snowCover * 0.055;
  state.snowCover = clamp01(state.snowCover + (snowAccumulation - state.snowCover * melt - rainWash) * deltaTime);
  return state;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
