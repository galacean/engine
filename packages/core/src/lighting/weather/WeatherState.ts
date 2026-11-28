/** Sky and environment-lighting modifiers evaluated independently from clouds and precipitation. */
export interface WeatherSkyLightingState {
  directLightMultiplier: number;
  shadowStrengthMultiplier: number;
  ambientLightMultiplier: number;
  reflectionMultiplier: number;
  fogDensityMultiplier: number;
  exposureOffset: number;
}

/** Visible cloud shape and optical extinction evaluated as an independent weather channel. */
export interface WeatherCloudState {
  cloudCoverage: number;
  cloudType: number;
  cloudDetail: number;
  cloudDensityMultiplier: number;
  cloudTransmittance: number;
  skyOcclusion: number;
}

/** Falling-water and falling-snow inputs, with only the air properties needed by surface climate. */
export interface WeatherPrecipitationState {
  rainRate: number;
  snowRate: number;
  temperatureCelsius: number;
  relativeHumidity: number;
}

/** Wind forcing composed on top of a Scene-owned wind baseline. */
export interface WeatherWindState {
  forceMultiplier: number;
  directionOffsetDegrees: number;
  gustStrength: number;
  turbulence: number;
}

/** Lightning occurrence and flash strength, independent from rain intensity. */
export interface WeatherLightningState {
  frequency: number;
  strength: number;
}

/** Shared engine weather state with independently authorable channels. */
export interface WeatherState {
  skyLighting: WeatherSkyLightingState;
  cloud: WeatherCloudState;
  precipitation: WeatherPrecipitationState;
  wind: WeatherWindState;
  lightning: WeatherLightningState;
}

/** Per-channel progress so unrelated weather changes never restart one another. */
export interface WeatherTransitionProgress {
  skyLighting: number;
  cloud: number;
  precipitation: number;
  wind: number;
  lightning: number;
}

/** Engine defaults that applications may combine freely or replace with authored values. */
export const WeatherPresets = Object.freeze({
  skyLighting: Object.freeze({
    clear: sky({
      directLightMultiplier: 1,
      shadowStrengthMultiplier: 1,
      ambientLightMultiplier: 1,
      reflectionMultiplier: 1,
      fogDensityMultiplier: 1,
      exposureOffset: 0
    }),
    overcast: sky({
      directLightMultiplier: 0.72,
      shadowStrengthMultiplier: 0.55,
      ambientLightMultiplier: 0.82,
      reflectionMultiplier: 0.76,
      fogDensityMultiplier: 1.8,
      exposureOffset: -0.18
    }),
    storm: sky({
      directLightMultiplier: 0.4,
      shadowStrengthMultiplier: 0.2,
      ambientLightMultiplier: 0.5,
      reflectionMultiplier: 0.56,
      fogDensityMultiplier: 5.2,
      exposureOffset: -0.48
    }),
    fog: sky({
      directLightMultiplier: 0.48,
      shadowStrengthMultiplier: 0.28,
      ambientLightMultiplier: 0.72,
      reflectionMultiplier: 0.58,
      fogDensityMultiplier: 8,
      exposureOffset: -0.2
    })
  }),
  cloud: Object.freeze({
    clear: cloud({
      cloudCoverage: 0,
      cloudType: 0.45,
      cloudDetail: 0.3,
      cloudDensityMultiplier: 0.8,
      cloudTransmittance: 1,
      skyOcclusion: 0
    }),
    scattered: cloud({
      cloudCoverage: 0.45,
      cloudType: 0.52,
      cloudDetail: 0.38,
      cloudDensityMultiplier: 1,
      cloudTransmittance: 1,
      skyOcclusion: 0.08
    }),
    overcast: cloud({
      cloudCoverage: 0.87,
      cloudType: 0.6,
      cloudDetail: 0.48,
      cloudDensityMultiplier: 1.24,
      cloudTransmittance: 0.48,
      skyOcclusion: 0.78
    }),
    dense: cloud({
      cloudCoverage: 1,
      cloudType: 0.76,
      cloudDetail: 0.78,
      cloudDensityMultiplier: 1.34,
      cloudTransmittance: 0.12,
      skyOcclusion: 1
    })
  }),
  precipitation: Object.freeze({
    none: precipitation({ rainRate: 0, snowRate: 0, temperatureCelsius: 22, relativeHumidity: 0.38 }),
    rain: precipitation({ rainRate: 0.72, snowRate: 0, temperatureCelsius: 11, relativeHumidity: 0.94 }),
    heavyRain: precipitation({ rainRate: 1, snowRate: 0, temperatureCelsius: 8, relativeHumidity: 1 }),
    snow: precipitation({ rainRate: 0, snowRate: 0.78, temperatureCelsius: -5, relativeHumidity: 0.9 })
  }),
  wind: Object.freeze({
    off: wind({
      forceMultiplier: 0,
      directionOffsetDegrees: 0,
      gustStrength: 0,
      turbulence: 0
    }),
    calm: wind({
      forceMultiplier: 0.35,
      directionOffsetDegrees: -6,
      gustStrength: 0.04,
      turbulence: 0.05
    }),
    breeze: wind({ forceMultiplier: 0.8, directionOffsetDegrees: 0, gustStrength: 0.1, turbulence: 0.12 }),
    windy: wind({
      forceMultiplier: 1.45,
      directionOffsetDegrees: 16,
      gustStrength: 0.28,
      turbulence: 0.36
    }),
    gale: wind({
      forceMultiplier: 2.4,
      directionOffsetDegrees: 32,
      gustStrength: 0.58,
      turbulence: 0.78
    })
  }),
  lightning: Object.freeze({
    none: lightning({ frequency: 0, strength: 0 }),
    thunderstorm: lightning({ frequency: 0.22, strength: 3.2 })
  })
});

/** Creates the neutral clear-sky state without sharing mutable preset objects. */
export function createDefaultWeatherState(): WeatherState {
  return {
    skyLighting: cloneWeatherSkyLightingState(WeatherPresets.skyLighting.clear),
    cloud: cloneWeatherCloudState(WeatherPresets.cloud.scattered),
    precipitation: cloneWeatherPrecipitationState(WeatherPresets.precipitation.none),
    wind: cloneWeatherWindState(WeatherPresets.wind.breeze),
    lightning: cloneWeatherLightningState(WeatherPresets.lightning.none)
  };
}

/** Deeply clones one detached weather state. */
export function cloneWeatherState(state: Readonly<WeatherState>): WeatherState {
  return {
    skyLighting: cloneWeatherSkyLightingState(state.skyLighting),
    cloud: cloneWeatherCloudState(state.cloud),
    precipitation: cloneWeatherPrecipitationState(state.precipitation),
    wind: cloneWeatherWindState(state.wind),
    lightning: cloneWeatherLightningState(state.lightning)
  };
}

export function cloneWeatherSkyLightingState(state: Readonly<WeatherSkyLightingState>): WeatherSkyLightingState {
  return { ...state };
}

export function cloneWeatherCloudState(state: Readonly<WeatherCloudState>): WeatherCloudState {
  return { ...state };
}

export function cloneWeatherPrecipitationState(state: Readonly<WeatherPrecipitationState>): WeatherPrecipitationState {
  return { ...state };
}

export function cloneWeatherWindState(state: Readonly<WeatherWindState>): WeatherWindState {
  return { ...state };
}

export function cloneWeatherLightningState(state: Readonly<WeatherLightningState>): WeatherLightningState {
  return { ...state };
}

/** @internal */
export function validateWeatherState(state: Readonly<WeatherState>): void {
  validateWeatherSkyLightingState(state.skyLighting);
  validateWeatherCloudState(state.cloud);
  validateWeatherPrecipitationState(state.precipitation);
  validateWeatherWindState(state.wind);
  validateWeatherLightningState(state.lightning);
}

/** @internal */
export function validateWeatherSkyLightingState(state: Readonly<WeatherSkyLightingState>): void {
  validateFiniteRecord("sky lighting", state);
  validateUnitInterval("sky lighting", state, ["shadowStrengthMultiplier"]);
  validateNonNegative("sky lighting", state, [
    "directLightMultiplier",
    "ambientLightMultiplier",
    "reflectionMultiplier",
    "fogDensityMultiplier"
  ]);
}

/** @internal */
export function validateWeatherCloudState(state: Readonly<WeatherCloudState>): void {
  validateFiniteRecord("cloud", state);
  validateUnitInterval("cloud", state, [
    "cloudCoverage",
    "cloudType",
    "cloudDetail",
    "cloudTransmittance",
    "skyOcclusion"
  ]);
  validateNonNegative("cloud", state, ["cloudDensityMultiplier"]);
}

/** @internal */
export function validateWeatherPrecipitationState(state: Readonly<WeatherPrecipitationState>): void {
  validateFiniteRecord("precipitation", state);
  validateUnitInterval("precipitation", state, ["rainRate", "snowRate", "relativeHumidity"]);
}

/** @internal */
export function validateWeatherWindState(state: Readonly<WeatherWindState>): void {
  validateFiniteRecord("wind", state);
  validateNonNegative("wind", state, ["forceMultiplier"]);
  validateUnitInterval("wind", state, ["gustStrength", "turbulence"]);
}

/** @internal */
export function validateWeatherLightningState(state: Readonly<WeatherLightningState>): void {
  validateFiniteRecord("lightning", state);
  validateNonNegative("lightning", state, ["frequency", "strength"]);
}

function sky(state: WeatherSkyLightingState): Readonly<WeatherSkyLightingState> {
  validateWeatherSkyLightingState(state);
  return Object.freeze(state);
}

function cloud(state: WeatherCloudState): Readonly<WeatherCloudState> {
  validateWeatherCloudState(state);
  return Object.freeze(state);
}

function precipitation(state: WeatherPrecipitationState): Readonly<WeatherPrecipitationState> {
  validateWeatherPrecipitationState(state);
  return Object.freeze(state);
}

function wind(state: WeatherWindState): Readonly<WeatherWindState> {
  validateWeatherWindState(state);
  return Object.freeze(state);
}

function lightning(state: WeatherLightningState): Readonly<WeatherLightningState> {
  validateWeatherLightningState(state);
  return Object.freeze(state);
}

function validateFiniteRecord(label: string, state: object): void {
  for (const [name, value] of Object.entries(state)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new RangeError(`Weather ${label} ${name} must be finite.`);
    }
  }
}

function validateUnitInterval<T extends object>(label: string, state: T, keys: readonly (keyof T)[]): void {
  for (const key of keys) {
    const value = state[key] as number;
    if (value < 0 || value > 1) {
      throw new RangeError(`Weather ${label} ${String(key)} must be in [0, 1].`);
    }
  }
}

function validateNonNegative<T extends object>(label: string, state: T, keys: readonly (keyof T)[]): void {
  for (const key of keys) {
    if ((state[key] as number) < 0) {
      throw new RangeError(`Weather ${label} ${String(key)} must be non-negative.`);
    }
  }
}
