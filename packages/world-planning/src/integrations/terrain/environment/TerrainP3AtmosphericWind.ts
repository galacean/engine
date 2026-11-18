import {
  Vector3,
  WindSecondOrderAdapter,
  createWindSample,
  type WindSample,
  type WindSecondOrderOutput,
  type WindSecondOrderState,
  type WindVector3Like,
  type WindVector3Tuple
} from "@galacean/engine";
import type { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import {
  TERRAIN_P3_CLOUD_WIND_RESPONSE_PROFILE,
  TERRAIN_P3_SNOW_WIND_RESPONSE_PROFILE
} from "@galacean/engine-terrain/terrain/project/TerrainWindResponseProfiles";

const CLOUD_RESPONSE = new WindSecondOrderAdapter(TERRAIN_P3_CLOUD_WIND_RESPONSE_PROFILE);
const SNOW_RESPONSE = new WindSecondOrderAdapter(TERRAIN_P3_SNOW_WIND_RESPONSE_PROFILE);
const RAIN_SAMPLE_HEIGHT_ABOVE_CAMERA_METERS = 20;
const SNOW_SAMPLE_HEIGHT_ABOVE_CAMERA_METERS = 8;

interface AtmosphericChannel {
  readonly sample: WindSample;
  readonly state: WindSecondOrderState;
  readonly output: WindSecondOrderOutput;
  initialized: boolean;
}

export interface TerrainP3AtmosphericWindState {
  readonly cloudVelocityWS: Readonly<WindVector3Tuple>;
  readonly rainAirVelocityWS: Readonly<WindVector3Tuple>;
  readonly snowWindVelocityWS: Readonly<WindVector3Tuple>;
  readonly cloudSampleSpeedMps: number;
  readonly rainSampleSpeedMps: number;
  readonly snowSampleSpeedMps: number;
  readonly cloudTurbulence: number;
  readonly rainTurbulence: number;
  readonly snowTurbulence: number;
  readonly cloudLayer: "cloud";
  readonly rainLayer: "canopy";
  readonly snowLayer: "canopy";
}

/**
 * Final P3 atmospheric receiver set.
 *
 * Each medium samples the shared spatial field at its own physical height. Rain forwards the
 * physical air velocity without temporal state; cloud and snow retain their medium response state.
 * No scalar wind globals or pre-P3 compatibility consumer participates.
 */
export class TerrainP3AtmosphericWind {
  private readonly _cloud = createChannel(CLOUD_RESPONSE);
  private readonly _rainSample = createWindSample();
  private readonly _rainAirVelocityWS: WindVector3Tuple = [0, 0, 0];
  private readonly _snow = createChannel(SNOW_RESPONSE);
  private readonly _cloudPosition = new Vector3();
  private readonly _rainPosition = new Vector3();
  private readonly _snowPosition = new Vector3();
  private readonly _frame = { deltaTimeSeconds: 0, distanceToCameraMeters: 0 };
  private readonly _current: TerrainP3AtmosphericWindState = {
    cloudVelocityWS: this._cloud.output.responseWS,
    rainAirVelocityWS: this._rainAirVelocityWS,
    snowWindVelocityWS: this._snow.output.responseWS,
    cloudSampleSpeedMps: 0,
    rainSampleSpeedMps: 0,
    snowSampleSpeedMps: 0,
    cloudTurbulence: 0,
    rainTurbulence: 0,
    snowTurbulence: 0,
    cloudLayer: "cloud",
    rainLayer: "canopy",
    snowLayer: "canopy"
  };

  update(
    wind: TerrainWindRuntime,
    cameraPosition: WindVector3Like,
    cloudBaseAltitude: number,
    deltaTimeSeconds: number
  ): Readonly<TerrainP3AtmosphericWindState> {
    if (!Number.isFinite(cloudBaseAltitude)) throw new RangeError("Cloud wind sample altitude must be finite");
    if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) {
      throw new RangeError("Atmospheric wind delta time must be finite and non-negative");
    }
    this._cloudPosition.set(cameraPosition.x, cloudBaseAltitude, cameraPosition.z);
    this._rainPosition.set(
      cameraPosition.x,
      cameraPosition.y + RAIN_SAMPLE_HEIGHT_ABOVE_CAMERA_METERS,
      cameraPosition.z
    );
    this._snowPosition.set(
      cameraPosition.x,
      cameraPosition.y + SNOW_SAMPLE_HEIGHT_ABOVE_CAMERA_METERS,
      cameraPosition.z
    );
    this._frame.deltaTimeSeconds = deltaTimeSeconds;
    advanceChannel(wind, this._cloudPosition, CLOUD_RESPONSE, this._cloud, this._frame);
    wind.sample(this._rainPosition, "canopy", undefined, this._rainSample);
    copyTuple(this._rainSample.velocityWS, this._rainAirVelocityWS);
    advanceChannel(wind, this._snowPosition, SNOW_RESPONSE, this._snow, this._frame);

    const current = this._current as MutableAtmosphericState;
    current.cloudSampleSpeedMps = this._cloud.sample.speedMps;
    current.rainSampleSpeedMps = this._rainSample.speedMps;
    current.snowSampleSpeedMps = this._snow.sample.speedMps;
    current.cloudTurbulence = this._cloud.sample.turbulence;
    current.rainTurbulence = this._rainSample.turbulence;
    current.snowTurbulence = this._snow.sample.turbulence;
    return this._current;
  }

  getSnapshot(): TerrainP3AtmosphericWindState {
    return {
      ...this._current,
      cloudVelocityWS: [...this._current.cloudVelocityWS],
      rainAirVelocityWS: [...this._current.rainAirVelocityWS],
      snowWindVelocityWS: [...this._current.snowWindVelocityWS]
    };
  }

  reset(): void {
    resetChannel(this._cloud);
    resetTuple(this._rainAirVelocityWS);
    resetChannel(this._snow);
    const current = this._current as MutableAtmosphericState;
    current.cloudSampleSpeedMps = 0;
    current.rainSampleSpeedMps = 0;
    current.snowSampleSpeedMps = 0;
    current.cloudTurbulence = 0;
    current.rainTurbulence = 0;
    current.snowTurbulence = 0;
  }
}

type MutableAtmosphericState = {
  -readonly [Key in keyof TerrainP3AtmosphericWindState]: TerrainP3AtmosphericWindState[Key];
};

function createChannel(adapter: WindSecondOrderAdapter): AtmosphericChannel {
  return {
    sample: createWindSample(),
    state: adapter.createState(),
    output: adapter.createOutput(),
    initialized: false
  };
}

function advanceChannel(
  wind: TerrainWindRuntime,
  position: Vector3,
  adapter: WindSecondOrderAdapter,
  channel: AtmosphericChannel,
  frame: Readonly<{ deltaTimeSeconds: number; distanceToCameraMeters: number }>
): void {
  wind.sample(position, adapter.profile.layer, undefined, channel.sample);
  adapter.update(channel.sample, frame, channel.state, channel.output);
  if (channel.initialized) return;
  copyTuple(channel.output.targetWS, channel.state.targetWS);
  copyTuple(channel.output.targetWS, channel.state.responseWS);
  copyTuple(channel.output.targetWS, channel.output.responseWS);
  resetTuple(channel.state.responseVelocityWS);
  resetTuple(channel.output.responseVelocityWS);
  channel.initialized = true;
}

function resetChannel(channel: AtmosphericChannel): void {
  resetTuple(channel.state.targetWS);
  resetTuple(channel.state.responseWS);
  resetTuple(channel.state.responseVelocityWS);
  resetTuple(channel.output.targetWS);
  resetTuple(channel.output.responseWS);
  resetTuple(channel.output.responseVelocityWS);
  channel.initialized = false;
}

function copyTuple(source: readonly number[], target: WindVector3Tuple): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

function resetTuple(target: WindVector3Tuple): void {
  target[0] = 0;
  target[1] = 0;
  target[2] = 0;
}
