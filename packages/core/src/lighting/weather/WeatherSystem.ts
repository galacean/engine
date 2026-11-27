import { Signal } from "../../Signal";
import {
  cloneWeatherCloudState,
  cloneWeatherLightningState,
  cloneWeatherPrecipitationState,
  cloneWeatherSkyLightingState,
  cloneWeatherState,
  cloneWeatherWindState,
  createDefaultWeatherState,
  type WeatherCloudState,
  type WeatherLightningState,
  type WeatherPrecipitationState,
  type WeatherSkyLightingState,
  type WeatherState,
  type WeatherTransitionProgress,
  type WeatherWindState,
  validateWeatherCloudState,
  validateWeatherLightningState,
  validateWeatherPrecipitationState,
  validateWeatherSkyLightingState,
  validateWeatherState,
  validateWeatherWindState
} from "./WeatherState";

/** Runtime consumer of the shared, fully independent weather channels. */
export interface WeatherStateConsumer {
  applyWeatherState(state: WeatherState): void;
}

interface ChannelTransition {
  duration: number;
  elapsed: number;
}

const SKY_LIGHTING_KEYS: readonly (keyof WeatherSkyLightingState)[] = [
  "directLightMultiplier",
  "shadowStrengthMultiplier",
  "ambientLightMultiplier",
  "reflectionMultiplier",
  "fogDensityMultiplier",
  "exposureOffset"
];
const CLOUD_KEYS: readonly (keyof WeatherCloudState)[] = [
  "cloudCoverage",
  "cloudType",
  "cloudDetail",
  "cloudDensityMultiplier",
  "cloudTransmittance",
  "skyOcclusion"
];
const PRECIPITATION_KEYS: readonly (keyof WeatherPrecipitationState)[] = [
  "rainRate",
  "snowRate",
  "temperatureCelsius",
  "relativeHumidity"
];
const WIND_KEYS: readonly (keyof WeatherWindState)[] = [
  "forceMultiplier",
  "directionOffsetDegrees",
  "gustStrength",
  "turbulence"
];
const LIGHTNING_KEYS: readonly (keyof WeatherLightningState)[] = ["frequency", "strength"];

/**
 * Engine-level weather state producer.
 *
 * @remarks
 * Sky lighting, clouds, precipitation, wind, and lightning transition independently. The
 * system owns no Scene lights, particles, cloud material, or wind component;
 * render systems opt in through {@link addConsumer} and compose the shared state.
 */
export class WeatherSystem {
  /** Invoked whenever one or more evaluated channels change. */
  readonly stateChanged = new Signal<[WeatherState]>();
  /** Current shared output state. The instance and its channel objects are reused. */
  readonly state: WeatherState;

  private readonly _consumers: WeatherStateConsumer[] = [];
  private readonly _skyLightingTransition: ChannelTransition = { duration: 0, elapsed: 0 };
  private readonly _cloudTransition: ChannelTransition = { duration: 0, elapsed: 0 };
  private readonly _precipitationTransition: ChannelTransition = { duration: 0, elapsed: 0 };
  private readonly _windTransition: ChannelTransition = { duration: 0, elapsed: 0 };
  private readonly _lightningTransition: ChannelTransition = { duration: 0, elapsed: 0 };
  private _skyLightingFrom: WeatherSkyLightingState;
  private _skyLightingTarget: WeatherSkyLightingState;
  private _cloudFrom: WeatherCloudState;
  private _cloudTarget: WeatherCloudState;
  private _precipitationFrom: WeatherPrecipitationState;
  private _precipitationTarget: WeatherPrecipitationState;
  private _windFrom: WeatherWindState;
  private _windTarget: WeatherWindState;
  private _lightningFrom: WeatherLightningState;
  private _lightningTarget: WeatherLightningState;

  constructor(initialState: Readonly<WeatherState> = createDefaultWeatherState()) {
    validateWeatherState(initialState);
    this.state = cloneWeatherState(initialState);
    this._skyLightingFrom = cloneWeatherSkyLightingState(initialState.skyLighting);
    this._skyLightingTarget = cloneWeatherSkyLightingState(initialState.skyLighting);
    this._cloudFrom = cloneWeatherCloudState(initialState.cloud);
    this._cloudTarget = cloneWeatherCloudState(initialState.cloud);
    this._precipitationFrom = cloneWeatherPrecipitationState(initialState.precipitation);
    this._precipitationTarget = cloneWeatherPrecipitationState(initialState.precipitation);
    this._windFrom = cloneWeatherWindState(initialState.wind);
    this._windTarget = cloneWeatherWindState(initialState.wind);
    this._lightningFrom = cloneWeatherLightningState(initialState.lightning);
    this._lightningTarget = cloneWeatherLightningState(initialState.lightning);
  }

  /** Add a consumer and immediately synchronize it with all five channels. */
  addConsumer(consumer: WeatherStateConsumer): void {
    if (this._consumers.includes(consumer)) return;
    this._consumers.push(consumer);
    consumer.applyWeatherState(this.state);
  }

  /** Remove a state consumer. */
  removeConsumer(consumer: WeatherStateConsumer): boolean {
    const index = this._consumers.indexOf(consumer);
    if (index < 0) return false;
    this._consumers.splice(index, 1);
    return true;
  }

  /** Changes only sky and environment-lighting modifiers. */
  setSkyLighting(state: Readonly<WeatherSkyLightingState>, duration = 0): void {
    validateWeatherSkyLightingState(state);
    validateDuration(duration);
    copyState(this.state.skyLighting, this._skyLightingFrom, SKY_LIGHTING_KEYS);
    copyState(state, this._skyLightingTarget, SKY_LIGHTING_KEYS);
    startTransition(this._skyLightingTransition, duration);
    if (duration === 0) {
      copyState(state, this.state.skyLighting, SKY_LIGHTING_KEYS);
      this._publish();
    }
  }

  /** Changes only visible cloud shape and optical extinction. */
  setCloud(state: Readonly<WeatherCloudState>, duration = 0): void {
    validateWeatherCloudState(state);
    validateDuration(duration);
    copyState(this.state.cloud, this._cloudFrom, CLOUD_KEYS);
    copyState(state, this._cloudTarget, CLOUD_KEYS);
    startTransition(this._cloudTransition, duration);
    if (duration === 0) {
      copyState(state, this.state.cloud, CLOUD_KEYS);
      this._publish();
    }
  }

  /** Changes only rain, snow, temperature, and humidity. */
  setPrecipitation(state: Readonly<WeatherPrecipitationState>, duration = 0): void {
    validateWeatherPrecipitationState(state);
    validateDuration(duration);
    copyState(this.state.precipitation, this._precipitationFrom, PRECIPITATION_KEYS);
    copyState(state, this._precipitationTarget, PRECIPITATION_KEYS);
    startTransition(this._precipitationTransition, duration);
    if (duration === 0) {
      copyState(state, this.state.precipitation, PRECIPITATION_KEYS);
      this._publish();
    }
  }

  /** Changes only wind forcing. */
  setWind(state: Readonly<WeatherWindState>, duration = 0): void {
    validateWeatherWindState(state);
    validateDuration(duration);
    copyState(this.state.wind, this._windFrom, WIND_KEYS);
    copyState(state, this._windTarget, WIND_KEYS);
    startTransition(this._windTransition, duration);
    if (duration === 0) {
      copyState(state, this.state.wind, WIND_KEYS);
      this._publish();
    }
  }

  /** Changes only lightning scheduling and flash strength. */
  setLightning(state: Readonly<WeatherLightningState>, duration = 0): void {
    validateWeatherLightningState(state);
    validateDuration(duration);
    copyState(this.state.lightning, this._lightningFrom, LIGHTNING_KEYS);
    copyState(state, this._lightningTarget, LIGHTNING_KEYS);
    startTransition(this._lightningTransition, duration);
    if (duration === 0) {
      copyState(state, this.state.lightning, LIGHTNING_KEYS);
      this._publish();
    }
  }

  /** Changes every channel together while preserving independent future control. */
  setState(state: Readonly<WeatherState>, duration = 0): void {
    validateWeatherState(state);
    validateDuration(duration);
    copyState(this.state.skyLighting, this._skyLightingFrom, SKY_LIGHTING_KEYS);
    copyState(state.skyLighting, this._skyLightingTarget, SKY_LIGHTING_KEYS);
    copyState(this.state.cloud, this._cloudFrom, CLOUD_KEYS);
    copyState(state.cloud, this._cloudTarget, CLOUD_KEYS);
    copyState(this.state.precipitation, this._precipitationFrom, PRECIPITATION_KEYS);
    copyState(state.precipitation, this._precipitationTarget, PRECIPITATION_KEYS);
    copyState(this.state.wind, this._windFrom, WIND_KEYS);
    copyState(state.wind, this._windTarget, WIND_KEYS);
    copyState(this.state.lightning, this._lightningFrom, LIGHTNING_KEYS);
    copyState(state.lightning, this._lightningTarget, LIGHTNING_KEYS);
    startTransition(this._skyLightingTransition, duration);
    startTransition(this._cloudTransition, duration);
    startTransition(this._precipitationTransition, duration);
    startTransition(this._windTransition, duration);
    startTransition(this._lightningTransition, duration);
    if (duration === 0) {
      copyState(state.skyLighting, this.state.skyLighting, SKY_LIGHTING_KEYS);
      copyState(state.cloud, this.state.cloud, CLOUD_KEYS);
      copyState(state.precipitation, this.state.precipitation, PRECIPITATION_KEYS);
      copyState(state.wind, this.state.wind, WIND_KEYS);
      copyState(state.lightning, this.state.lightning, LIGHTNING_KEYS);
      this._publish();
    }
  }

  /** Advances active channel transitions and publishes at most once. */
  update(deltaTime: number): void {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("WeatherSystem deltaTime must be a finite non-negative number.");
    }
    const changed =
      advanceTransition(
        this._skyLightingTransition,
        this._skyLightingFrom,
        this._skyLightingTarget,
        this.state.skyLighting,
        deltaTime,
        SKY_LIGHTING_KEYS
      ) |
      advanceTransition(
        this._cloudTransition,
        this._cloudFrom,
        this._cloudTarget,
        this.state.cloud,
        deltaTime,
        CLOUD_KEYS
      ) |
      advanceTransition(
        this._precipitationTransition,
        this._precipitationFrom,
        this._precipitationTarget,
        this.state.precipitation,
        deltaTime,
        PRECIPITATION_KEYS
      ) |
      advanceTransition(this._windTransition, this._windFrom, this._windTarget, this.state.wind, deltaTime, WIND_KEYS) |
      advanceTransition(
        this._lightningTransition,
        this._lightningFrom,
        this._lightningTarget,
        this.state.lightning,
        deltaTime,
        LIGHTNING_KEYS
      );
    if (changed !== 0) this._publish();
  }

  /** Returns a detached state for diagnostics or serialization. */
  getSnapshot(): WeatherState {
    return cloneWeatherState(this.state);
  }

  /** Detached complete destination, including channels whose transition is still pending. */
  getTargetSnapshot(): WeatherState {
    return cloneWeatherState({
      skyLighting: this._skyLightingTarget,
      cloud: this._cloudTarget,
      precipitation: this._precipitationTarget,
      wind: this._windTarget,
      lightning: this._lightningTarget
    });
  }

  /** Seek all configured channels using a shared external transition clock. */
  setTransitionProgress(progress: number): void {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1)
      throw new RangeError("Weather progress must be 0–1");
    seekTransition(
      this._skyLightingTransition,
      this._skyLightingFrom,
      this._skyLightingTarget,
      this.state.skyLighting,
      progress,
      SKY_LIGHTING_KEYS
    );
    seekTransition(this._cloudTransition, this._cloudFrom, this._cloudTarget, this.state.cloud, progress, CLOUD_KEYS);
    seekTransition(
      this._precipitationTransition,
      this._precipitationFrom,
      this._precipitationTarget,
      this.state.precipitation,
      progress,
      PRECIPITATION_KEYS
    );
    seekTransition(this._windTransition, this._windFrom, this._windTarget, this.state.wind, progress, WIND_KEYS);
    seekTransition(
      this._lightningTransition,
      this._lightningFrom,
      this._lightningTarget,
      this.state.lightning,
      progress,
      LIGHTNING_KEYS
    );
    this._publish();
  }

  /** Returns independent transition progress for every channel as a detached diagnostic snapshot. */
  getTransitionProgress(): WeatherTransitionProgress;
  /** Returns one channel's transition progress without allocating a snapshot. */
  getTransitionProgress(channel: keyof WeatherState): number;
  getTransitionProgress(channel?: keyof WeatherState): WeatherTransitionProgress | number {
    if (channel !== undefined) {
      switch (channel) {
        case "skyLighting":
          return transitionProgress(this._skyLightingTransition);
        case "cloud":
          return transitionProgress(this._cloudTransition);
        case "precipitation":
          return transitionProgress(this._precipitationTransition);
        case "wind":
          return transitionProgress(this._windTransition);
        case "lightning":
          return transitionProgress(this._lightningTransition);
      }
    }
    return {
      skyLighting: transitionProgress(this._skyLightingTransition),
      cloud: transitionProgress(this._cloudTransition),
      precipitation: transitionProgress(this._precipitationTransition),
      wind: transitionProgress(this._windTransition),
      lightning: transitionProgress(this._lightningTransition)
    };
  }

  private _publish(): void {
    const consumers = this._consumers;
    for (let i = 0; i < consumers.length; i++) consumers[i].applyWeatherState(this.state);
    this.stateChanged.invoke(this.state);
  }
}

function startTransition(transition: ChannelTransition, duration: number): void {
  transition.duration = duration;
  transition.elapsed = duration === 0 ? duration : 0;
}

function advanceTransition<T extends object>(
  transition: ChannelTransition,
  from: Readonly<T>,
  target: Readonly<T>,
  output: T,
  deltaTime: number,
  keys: readonly (keyof T)[]
): number {
  if (deltaTime === 0 || transition.duration === 0 || transition.elapsed >= transition.duration) return 0;
  transition.elapsed = Math.min(transition.elapsed + deltaTime, transition.duration);
  const progress = smoothstep(transition.elapsed / transition.duration);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const start = from[key] as number;
    output[key] = (start + ((target[key] as number) - start) * progress) as T[keyof T];
  }
  return 1;
}

function transitionProgress(transition: Readonly<ChannelTransition>): number {
  return transition.duration === 0 ? 1 : Math.min(transition.elapsed / transition.duration, 1);
}

function seekTransition<T extends object>(
  transition: ChannelTransition,
  from: Readonly<T>,
  target: Readonly<T>,
  output: T,
  progress: number,
  keys: readonly (keyof T)[]
): void {
  transition.elapsed = transition.duration * progress;
  const weight = transition.duration === 0 ? 1 : smoothstep(progress);
  for (const key of keys)
    output[key] = ((from[key] as number) + ((target[key] as number) - (from[key] as number)) * weight) as T[keyof T];
}

function copyState<T extends object>(source: Readonly<T>, target: T, keys: readonly (keyof T)[]): void {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    target[key] = source[key];
  }
}

function validateDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError("Weather transition duration must be finite and non-negative.");
  }
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}
