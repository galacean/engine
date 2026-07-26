import { Color, Quaternion, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import type { Scene } from "../../Scene";
import type { SkyBoxMaterial } from "../../sky/SkyBoxMaterial";
import type { SkyProceduralMaterial } from "../../sky/SkyProceduralMaterial";
import type { TextureCube } from "../../texture";
import { FogMode } from "../../enums/FogMode";
import type { BloomEffect, ColorAdjustmentsEffect } from "../../postProcess/effects";
import type { AmbientLight } from "../AmbientLight";
import { DirectLight } from "../DirectLight";
import { DiffuseMode } from "../enums/DiffuseMode";
import type { EnvironmentLighting } from "../environment/EnvironmentLighting";
import type { ProbeVolume } from "../environment/ProbeVolume";
import type { DayNightState } from "./DayNightProfile";
import type { DayNightStateConsumer } from "./DayNightSystem";

/**
 * Applies real-time solar state to an existing directional light.
 *
 * @remarks
 * The light remains registered and retains its shadow type, so time changes do
 * not alter direct-light or shadow shader variants. A zero shadow strength is
 * used to skip shadow-map rendering at night.
 */
export class DayNightLightingAdapter implements DayNightStateConsumer {
  /** Sun intensity below which shadow strength is forced to zero. */
  shadowDisableThreshold = 0.01;

  private static _up = new Vector3(0, 1, 0);
  private _target = new Vector3();

  constructor(readonly light: DirectLight) {}

  applyDayNightState(state: DayNightState): void {
    const light = this.light;
    const intensity = state.sunIntensity <= this.shadowDisableThreshold ? 0 : state.sunIntensity;
    light.color.set(
      state.sunColor.r * intensity,
      state.sunColor.g * intensity,
      state.sunColor.b * intensity,
      state.sunColor.a
    );
    light.shadowStrength = intensity === 0 ? 0 : state.shadowStrength;

    const transform = light.entity.transform;
    Vector3.add(transform.worldPosition, state.sunDirection, this._target);
    transform.lookAt(this._target, DayNightLightingAdapter._up);
  }
}

/** Authored direct-light and diffuse-environment state at one local hour. */
export interface DayNightLightingScenarioKey {
  /** Local hour in the range [0, 24). */
  timeHours: number;
  /** Scenario label used for diagnostics. */
  scenario: string;
  /** Authored local Euler rotation in degrees. */
  sunRotation: Vector3;
  /** Linear direct-light color including authored energy. */
  sunColor: Color;
  shadowStrength: number;
  diffuseSphericalHarmonics: SphericalHarmonics3;
  diffuseIntensity: number;
  specularIntensity?: number;
}

/**
 * Blends authored direct light and environment SH on a repeating timeline.
 *
 * @remarks
 * This adapter is intended for projects whose baked lighting scenarios have
 * matching authored real-time light and environment states. It updates a small
 * fixed set of uniforms at the day/night system frequency; Probe SH stays on
 * the independent GPU scenario-blend path.
 */
export class DayNightLightingScenarioAdapter implements DayNightStateConsumer {
  /**
   * Whether authored scenario snapshots also control the direct light.
   *
   * Disable this when the direct light is a continuously moving sun driven by
   * {@link DayNightLightingAdapter}. The scenario timeline then remains
   * responsible only for baked diffuse-environment data.
   */
  applyDirectLight = true;

  private _keys: DayNightLightingScenarioKey[];
  private _blendedRotation = new Quaternion();
  private _blendedSH = new SphericalHarmonics3();
  private _activeScenario = "";
  private _targetScenario = "";
  private _blendFactor = 0;

  constructor(
    readonly light: DirectLight,
    readonly ambientLight: AmbientLight,
    keys: readonly DayNightLightingScenarioKey[]
  ) {
    validateTimelineKeys(keys, "DayNightLightingScenarioAdapter");
    this._keys = keys
      .map((key) => {
        if (
          !Number.isFinite(key.shadowStrength) ||
          !Number.isFinite(key.diffuseIntensity) ||
          !Number.isFinite(key.specularIntensity ?? 0)
        ) {
          throw new Error("DayNightLightingScenarioAdapter intensities must be finite.");
        }
        return {
          ...key,
          sunRotation: key.sunRotation.clone(),
          sunColor: key.sunColor.clone(),
          diffuseSphericalHarmonics: key.diffuseSphericalHarmonics.clone()
        };
      })
      .sort((left, right) => left.timeHours - right.timeHours);
  }

  /** Authored state currently occupying the first interpolation slot. */
  get activeScenario(): string {
    return this._activeScenario;
  }

  /** Authored state currently occupying the second interpolation slot. */
  get targetScenario(): string {
    return this._targetScenario;
  }

  /** Blend weight from {@link activeScenario} to {@link targetScenario}. */
  get blendFactor(): number {
    return this._blendFactor;
  }

  applyDayNightState(state: DayNightState): void {
    const segment = getTimelineSegment(this._keys, state.timeHours);
    const active = this._keys[segment.activeIndex];
    const target = this._keys[segment.targetIndex];
    const factor = segment.factor;

    if (this.applyDirectLight) {
      Color.lerp(active.sunColor, target.sunColor, factor, this.light.color);
      const activeRotation = active.sunRotation;
      const targetRotation = target.sunRotation;
      Quaternion.rotationEuler(
        (lerpAngleDegrees(activeRotation.x, targetRotation.x, factor) * Math.PI) / 180,
        (lerpAngleDegrees(activeRotation.y, targetRotation.y, factor) * Math.PI) / 180,
        (lerpAngleDegrees(activeRotation.z, targetRotation.z, factor) * Math.PI) / 180,
        this._blendedRotation
      );
      this.light.entity.transform.rotationQuaternion = this._blendedRotation;
      this.light.shadowStrength = lerp(active.shadowStrength, target.shadowStrength, factor);
    }

    const activeSH = active.diffuseSphericalHarmonics.coefficients;
    const targetSH = target.diffuseSphericalHarmonics.coefficients;
    const blendedSH = this._blendedSH.coefficients;
    for (let i = 0; i < blendedSH.length; i++) {
      blendedSH[i] = lerp(activeSH[i], targetSH[i], factor);
    }
    const ambient = this.ambientLight;
    ambient.diffuseMode = DiffuseMode.SphericalHarmonics;
    ambient.diffuseSphericalHarmonics = this._blendedSH;
    ambient.diffuseIntensity = lerp(active.diffuseIntensity, target.diffuseIntensity, factor);
    ambient.specularIntensity = lerp(active.specularIntensity ?? 0, target.specularIntensity ?? 0, factor);

    this._activeScenario = active.scenario;
    this._targetScenario = target.scenario;
    this._blendFactor = factor;
  }
}

/**
 * Applies the night factor to a stable Day/Night probe scenario pair.
 */
export class DayNightProbeAdapter implements DayNightStateConsumer {
  private _preparedVolume?: ProbeVolume;

  constructor(
    readonly environmentLighting: EnvironmentLighting,
    readonly dayScenario = "Day",
    readonly nightScenario = "Night"
  ) {}

  applyDayNightState(state: DayNightState): void {
    const volume = this.environmentLighting.probeVolume;
    if (!volume) {
      this._preparedVolume = undefined;
      return;
    }

    if (this._preparedVolume !== volume) {
      if (!volume.lightingScenarioNames.includes(this.dayScenario)) {
        throw new Error(`DayNightProbeAdapter probe volume does not contain "${this.dayScenario}".`);
      }
      if (!volume.lightingScenarioNames.includes(this.nightScenario)) {
        throw new Error(`DayNightProbeAdapter probe volume does not contain "${this.nightScenario}".`);
      }
      if (volume.lightingScenario !== this.dayScenario) {
        volume.lightingScenario = this.dayScenario;
      }
      volume.setLightingScenarioBlendTarget(this.nightScenario);
      this._preparedVolume = volume;
    }
    volume.setLightingScenarioBlendFactor(state.nightFactor);
  }
}

/** One baked Probe scenario anchored to a local hour in a repeating 24-hour timeline. */
export interface DayNightProbeScenarioKey {
  /** Local hour in the range [0, 24). */
  timeHours: number;
  /** Baked lighting scenario name. */
  scenario: string;
}

/**
 * Blends the two Probe scenarios surrounding the current time.
 *
 * @remarks
 * Scenario changes only happen when time crosses a key. Within a segment, the
 * adapter updates one GPU blend uniform and does not alter Probe chunk
 * residency or shader variants.
 */
export class DayNightProbeTimelineAdapter implements DayNightStateConsumer {
  private _keys: DayNightProbeScenarioKey[];
  private _preparedVolume?: ProbeVolume;
  private _activeScenario = "";
  private _targetScenario = "";
  private _blendFactor = 0;

  constructor(
    readonly environmentLighting: EnvironmentLighting,
    keys: readonly DayNightProbeScenarioKey[]
  ) {
    validateTimelineKeys(keys, "DayNightProbeTimelineAdapter");
    this._keys = keys.map(({ timeHours, scenario }) => {
      return { timeHours, scenario };
    });
    this._keys.sort((left, right) => left.timeHours - right.timeHours);
  }

  /** Active baked scenario selected by the current timeline segment. */
  get activeScenario(): string {
    return this._activeScenario;
  }

  /** Target baked scenario selected by the current timeline segment. */
  get targetScenario(): string {
    return this._targetScenario;
  }

  /** Blend weight from {@link activeScenario} to {@link targetScenario}. */
  get blendFactor(): number {
    return this._blendFactor;
  }

  applyDayNightState(state: DayNightState): void {
    const volume = this.environmentLighting.probeVolume;
    if (!volume) {
      this._preparedVolume = undefined;
      this._activeScenario = "";
      this._targetScenario = "";
      this._blendFactor = 0;
      return;
    }

    if (this._preparedVolume !== volume) {
      const availableScenarios = volume.lightingScenarioNames;
      for (let i = 0; i < this._keys.length; i++) {
        const scenario = this._keys[i].scenario;
        if (!availableScenarios.includes(scenario)) {
          throw new Error(`DayNightProbeTimelineAdapter probe volume does not contain "${scenario}".`);
        }
      }
      this._preparedVolume = volume;
      this._activeScenario = "";
      this._targetScenario = "";
    }

    const segment = getTimelineSegment(this._keys, state.timeHours);
    const pair = {
      activeScenario: this._keys[segment.activeIndex].scenario,
      targetScenario: this._keys[segment.targetIndex].scenario,
      factor: segment.factor
    };
    if (this._activeScenario !== pair.activeScenario || this._targetScenario !== pair.targetScenario) {
      volume.setLightingScenarioBlendPair(pair.activeScenario, pair.targetScenario);
      this._activeScenario = pair.activeScenario;
      this._targetScenario = pair.targetScenario;
    }
    this._blendFactor = pair.factor;
    volume.setLightingScenarioBlendFactor(pair.factor);
  }
}

/** Optional authored inputs for sky and environment reflection blending. */
export interface DayNightEnvironmentSources {
  dayDiffuseSH?: SphericalHarmonics3;
  nightDiffuseSH?: SphericalHarmonics3;
  daySpecularTexture?: TextureCube;
  nightSpecularTexture?: TextureCube;
  daySkyTexture?: TextureCube;
  nightSkyTexture?: TextureCube;
}

/**
 * Applies sky, diffuse environment, and specular IBL state to a scene.
 */
export class DayNightEnvironmentAdapter implements DayNightStateConsumer {
  private _blendedSH = new SphericalHarmonics3();

  constructor(
    readonly scene: Scene,
    readonly sources: DayNightEnvironmentSources = {}
  ) {
    const ambient = scene.ambientLight;
    if (sources.daySpecularTexture) {
      ambient.specularTexture = sources.daySpecularTexture;
    }
    ambient.secondarySpecularTexture = sources.nightSpecularTexture ?? null;

    const skyMaterial = scene.background.sky.material;
    if (isSkyBoxMaterial(skyMaterial) && sources.daySkyTexture) {
      skyMaterial.texture = sources.daySkyTexture;
      skyMaterial.secondaryTexture = sources.nightSkyTexture ?? null;
    }
  }

  applyDayNightState(state: DayNightState): void {
    const scene = this.scene;
    const ambient = scene.ambientLight;
    const sources = this.sources;
    const daySH = sources.dayDiffuseSH;
    const nightSH = sources.nightDiffuseSH;

    if (daySH && nightSH) {
      const out = this._blendedSH.coefficients;
      const day = daySH.coefficients;
      const night = nightSH.coefficients;
      const factor = state.environmentBlend;
      for (let i = 0; i < out.length; i++) {
        out[i] = day[i] + (night[i] - day[i]) * factor;
      }
      ambient.diffuseMode = DiffuseMode.SphericalHarmonics;
      ambient.diffuseSphericalHarmonics = this._blendedSH;
    } else if (daySH) {
      ambient.diffuseMode = DiffuseMode.SphericalHarmonics;
      ambient.diffuseSphericalHarmonics = daySH;
    }

    ambient.diffuseIntensity = state.ambientIntensity;
    ambient.specularIntensity = state.iblIntensity;
    ambient.specularTextureBlend = state.environmentBlend;

    const skyMaterial = scene.background.sky.material;
    if (isProceduralSkyMaterial(skyMaterial)) {
      skyMaterial.skyTint = state.skyTint;
      skyMaterial.groundTint = state.groundTint;
      skyMaterial.exposure = state.skyExposure;
      skyMaterial.atmosphereThickness = state.atmosphereThickness;
    } else if (isSkyBoxMaterial(skyMaterial)) {
      skyMaterial.textureBlend = state.environmentBlend;
      skyMaterial.exposure = state.skyExposure;
    }
  }
}

/**
 * Applies camera exposure, white balance, Bloom threshold, and scene fog.
 */
export class DayNightPostProcessFogAdapter implements DayNightStateConsumer {
  /** Fog mode retained throughout the transition to keep its shader variant stable. */
  fogMode = FogMode.ExponentialSquared;

  constructor(
    readonly scene: Scene,
    readonly colorAdjustments: ColorAdjustmentsEffect,
    readonly bloom?: BloomEffect
  ) {
    scene.fogMode = this.fogMode;
  }

  applyDayNightState(state: DayNightState): void {
    this.colorAdjustments.postExposure.value = state.exposureCompensation;
    this.colorAdjustments.temperature.value = state.whiteBalanceTemperature;
    this.colorAdjustments.tint.value = state.whiteBalanceTint;
    if (this.bloom) {
      this.bloom.threshold.value = state.bloomThreshold;
    }

    this.scene.fogMode = this.fogMode;
    this.scene.fogColor = state.fogColor;
    this.scene.fogDensity = state.fogDensity * state.fogFactor;
  }
}

function isProceduralSkyMaterial(material: unknown): material is SkyProceduralMaterial {
  return Boolean(
    material &&
      typeof material === "object" &&
      "skyTint" in material &&
      "groundTint" in material &&
      "atmosphereThickness" in material
  );
}

function isSkyBoxMaterial(material: unknown): material is SkyBoxMaterial {
  return Boolean(
    material && typeof material === "object" && "textureBlend" in material && "secondaryTexture" in material
  );
}

function validateTimelineKeys(keys: readonly { timeHours: number; scenario: string }[], label: string): void {
  if (keys.length < 2) {
    throw new Error(`${label} requires at least two scenario keys.`);
  }
  const sortedKeys = keys.slice().sort((left, right) => left.timeHours - right.timeHours);
  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    if (!Number.isFinite(key.timeHours) || key.timeHours < 0 || key.timeHours >= 24) {
      throw new Error(`${label} key times must be in the range [0, 24).`);
    }
    if (!key.scenario) {
      throw new Error(`${label} scenario names must not be empty.`);
    }
    if (i > 0) {
      if (sortedKeys[i - 1].timeHours === key.timeHours) {
        throw new Error(`${label} key times must be unique.`);
      }
      if (sortedKeys[i - 1].scenario === key.scenario) {
        throw new Error(`${label} adjacent scenario names must differ.`);
      }
    }
  }
  if (sortedKeys[0].scenario === sortedKeys[sortedKeys.length - 1].scenario) {
    throw new Error(`${label} adjacent scenario names must differ across midnight.`);
  }
}

function getTimelineSegment(
  keys: readonly { timeHours: number }[],
  timeHours: number
): { activeIndex: number; targetIndex: number; factor: number } {
  const time = ((timeHours % 24) + 24) % 24;
  let activeIndex = keys.length - 1;
  for (let i = 0; i < keys.length; i++) {
    if (time >= keys[i].timeHours) {
      activeIndex = i;
    } else {
      break;
    }
  }

  const targetIndex = (activeIndex + 1) % keys.length;
  const active = keys[activeIndex];
  const target = keys[targetIndex];
  const endTime = activeIndex === keys.length - 1 ? target.timeHours + 24 : target.timeHours;
  const sampleTime = time < active.timeHours ? time + 24 : time;
  return {
    activeIndex,
    targetIndex,
    factor: (sampleTime - active.timeHours) / (endTime - active.timeHours)
  };
}

function lerp(from: number, to: number, factor: number): number {
  return from + (to - from) * factor;
}

function lerpAngleDegrees(from: number, to: number, factor: number): number {
  const delta = ((((to - from + 180) % 360) + 360) % 360) - 180;
  return from + delta * factor;
}
