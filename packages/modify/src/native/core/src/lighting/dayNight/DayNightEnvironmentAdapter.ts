import type { Scene } from "../../Scene";
import { FogMode } from "../../enums/FogMode";
import type { BloomEffect, ColorAdjustmentsEffect } from "../../postProcess/effects";
import type { RealtimeIBLBaker } from "../environment/RealtimeIBLBaker";
import type { DirectLight } from "../DirectLight";
import { DayNightLightingAdapter } from "./DayNightAdapters";
import type { DayNightState } from "./DayNightProfile";
import type { DayNightStateConsumer } from "./DayNightSystem";
import type { DayNightMoonLighting } from "./DayNightMoonLighting";
import type { DayNightProceduralSky } from "./DayNightProceduralSky";

/** Scene targets controlled by the engine-level day/night environment adapter. */
export interface DayNightEnvironmentAdapterOptions {
  /** Sun light to drive. Defaults to the Scene sun; `null` disables direct Sun writes. */
  sun?: DirectLight | null;
  sky?: DayNightProceduralSky;
  moon?: DayNightMoonLighting;
  colorAdjustments?: ColorAdjustmentsEffect;
  bloom?: BloomEffect;
  realtimeIBL?: RealtimeIBLBaker;
  /** Fog mode retained across the cycle. Defaults to the current Scene mode. */
  fogMode?: FogMode;
  /** Disable when another engine system owns ambient intensities. */
  applyAmbientLighting?: boolean;
  /** Disable when a weather or aerial-perspective system owns Scene fog. */
  applyFog?: boolean;
}

/**
 * Applies one shared {@link DayNightState} to engine Scene facilities.
 *
 * @remarks
 * This is the sole generic bridge between day/night evaluation and rendering.
 * Weather systems should run after it and modify the clear-sky baseline rather
 * than deriving another Sun position or time-of-day state.
 */
export class DayNightEnvironmentAdapter implements DayNightStateConsumer {
  readonly sunAdapter: DayNightLightingAdapter | null;
  readonly sky?: DayNightProceduralSky;
  readonly moon?: DayNightMoonLighting;
  readonly colorAdjustments?: ColorAdjustmentsEffect;
  readonly bloom?: BloomEffect;

  fogMode: FogMode;
  applyAmbientLighting: boolean;
  applyFog: boolean;
  realtimeIBL?: RealtimeIBLBaker;

  constructor(
    readonly scene: Scene,
    options: DayNightEnvironmentAdapterOptions = {}
  ) {
    const sun = options.sun === undefined ? scene.sun : options.sun;
    this.sunAdapter = sun ? new DayNightLightingAdapter(sun) : null;
    this.sky = options.sky;
    this.moon = options.moon;
    this.colorAdjustments = options.colorAdjustments;
    this.bloom = options.bloom;
    this.realtimeIBL = options.realtimeIBL;
    this.fogMode = options.fogMode ?? scene.fogMode;
    this.applyAmbientLighting = options.applyAmbientLighting ?? true;
    this.applyFog = options.applyFog ?? true;
  }

  applyDayNightState(state: Readonly<DayNightState>): void {
    this.sunAdapter?.applyDayNightState(state);
    this.sky?.applyDayNightState(state);
    const moonState = this.moon?.applyDayNightState(state);
    if (moonState && this.sky) {
      this.sky.applyMoonLighting(moonState);
    }

    if (this.applyAmbientLighting) {
      this.scene.ambientLight.diffuseIntensity = state.ambientIntensity;
      this.scene.ambientLight.specularIntensity = state.iblIntensity;
    }

    if (this.colorAdjustments) {
      this.colorAdjustments.postExposure.value = state.exposureCompensation;
      this.colorAdjustments.temperature.value = state.whiteBalanceTemperature;
      this.colorAdjustments.tint.value = state.whiteBalanceTint;
    }
    if (this.bloom) {
      this.bloom.threshold.value = state.bloomThreshold;
    }

    if (this.applyFog) {
      this.scene.fogMode = this.fogMode;
      this.scene.fogColor = state.fogColor;
      this.scene.fogDensity = state.fogDensity * state.fogFactor;
    }

    this.realtimeIBL?.requestBake();
  }
}
