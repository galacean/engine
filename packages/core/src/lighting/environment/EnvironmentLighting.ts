import { Color, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import type { Scene } from "../../Scene";
import type { Transform } from "../../Transform";
import type { ShaderData } from "../../shader/ShaderData";
import type { SkyProceduralMaterial } from "../../sky/SkyProceduralMaterial";
import { FogMode } from "../../enums/FogMode";
import { DiffuseMode } from "../enums/DiffuseMode";
import { EnvironmentState, EnvironmentWeather } from "./EnvironmentState";
import { ProbeVolume } from "./ProbeVolume";

/**
 * Coordinates sun, ambient light, fog, ambient occlusion and runtime probe sampling from one environment state.
 */
export class EnvironmentLighting {
  private static _up = new Vector3(0, 1, 0);
  private static _defaultSunDirection = new Vector3(0.35, -0.8, 0.35);
  private static _tempSunTarget = new Vector3();
  private static _tempSkySunDirection = new Vector3();

  /** Current environment state. */
  state: EnvironmentState;
  /** Whether this controller writes state back to the scene every frame. */
  enabled: boolean = false;
  private _scene: Scene;
  private _probeVolume?: ProbeVolume;
  /** Camera or player transform used to stream nearby probe cells. */
  probeVolumeAnchor?: Transform;
  private _generatedSH = new SphericalHarmonics3();
  private _transitionFrom: EnvironmentState | null = null;
  private _transitionTo: EnvironmentState | null = null;
  private _transitionDuration = 0;
  private _transitionElapsed = 0;

  /**
   * Create environment lighting for a scene.
   * @param scene - Owner scene
   * @param state - Initial state
   */
  constructor(scene: Scene, state: EnvironmentState = EnvironmentLighting.createDefaultState()) {
    this._scene = scene;
    this.state = cloneState(state);
  }

  /** Probe volume used for per-fragment baked diffuse lighting. */
  get probeVolume(): ProbeVolume | undefined {
    return this._probeVolume;
  }

  set probeVolume(value: ProbeVolume | undefined) {
    if (this._probeVolume === value) {
      return;
    }
    this._probeVolume?._unbindShaderData(this._scene.shaderData);
    this._probeVolume = value;
    value?._updateShaderData(this._scene.engine, this._scene.shaderData);
  }

  /** Names of the baked lighting scenarios available on the active probe volume. */
  get lightingScenarioNames(): readonly string[] {
    return this._probeVolume?.lightingScenarioNames ?? [];
  }

  /** Active baked lighting scenario, if a probe volume is assigned. */
  get lightingScenario(): string | undefined {
    return this._probeVolume?.lightingScenario;
  }

  set lightingScenario(value: string) {
    if (!this._probeVolume) {
      throw new Error("EnvironmentLighting requires a probe volume before selecting a lighting scenario.");
    }
    this._probeVolume.lightingScenario = value;
  }

  /**
   * Blend the active baked lighting scenario toward another scenario.
   * @remarks Probe SH blending runs on the GPU for per-vertex and per-fragment sampling.
   */
  blendLightingScenario(target: string, factor: number): void {
    if (!this._probeVolume) {
      throw new Error("EnvironmentLighting requires a probe volume before blending lighting scenarios.");
    }
    this._probeVolume.blendLightingScenario(target, factor);
  }

  /**
   * Keep a second probe lighting scenario resident for uniform-only runtime blending.
   */
  setLightingScenarioBlendTarget(target: string | null): void {
    if (!this._probeVolume) {
      throw new Error("EnvironmentLighting requires a probe volume before preparing a lighting scenario blend.");
    }
    this._probeVolume.setLightingScenarioBlendTarget(target);
  }

  /**
   * Update a prepared probe lighting scenario blend without rebuilding its GPU resources.
   */
  setLightingScenarioBlendFactor(factor: number): void {
    if (!this._probeVolume) {
      throw new Error("EnvironmentLighting requires a probe volume before blending lighting scenarios.");
    }
    this._probeVolume.setLightingScenarioBlendFactor(factor);
  }

  /**
   * Apply a state immediately.
   * @param state - Target environment state
   */
  applyState(state: EnvironmentState): void {
    this._transitionFrom = null;
    this._transitionTo = null;
    this._transitionDuration = 0;
    this._transitionElapsed = 0;
    this.state = cloneState(state);
    this.enabled = true;
    this._applyToScene(this.state);
  }

  /**
   * Transition to a state over time.
   * @param state - Target environment state
   * @param duration - Duration in seconds
   */
  transitionTo(state: EnvironmentState, duration: number): void {
    if (duration <= 0) {
      this.applyState(state);
      return;
    }
    this._transitionFrom = cloneState(this.state);
    this._transitionTo = cloneState(state);
    this._transitionDuration = duration;
    this._transitionElapsed = 0;
    this.enabled = true;
  }

  /**
   * Update transition and scene-side lighting.
   * @param deltaTime - Delta time in seconds
   */
  update(deltaTime: number): void {
    if (this._probeVolume && this.probeVolumeAnchor) {
      this._probeVolume.updateStreamingAnchor(this.probeVolumeAnchor.worldPosition);
    }
    this._probeVolume?._updateShaderData(this._scene.engine, this._scene.shaderData);
    if (!this.enabled) {
      return;
    }
    this._updateTransition(deltaTime);
    this._applyToScene(this.state);
  }

  /** @internal */
  _updateRendererProbeData(shaderData: ShaderData, position: Vector3): void {
    this._probeVolume?._updateRendererShaderData(shaderData, position);
  }

  /**
   * Create a default clear-day environment state.
   */
  static createDefaultState(): EnvironmentState {
    return deriveState({
      timeOfDay: 0.5,
      weather: "clear",
      iblIntensity: 1,
      aoEnabled: false
    });
  }

  /**
   * Derive a complete environment state from time of day and weather, with optional overrides.
   * @param options - State overrides
   */
  static deriveState(options: EnvironmentStateOptions = {}): EnvironmentState {
    return deriveState(options);
  }

  private _updateTransition(deltaTime: number): void {
    const from = this._transitionFrom;
    const to = this._transitionTo;
    if (!from || !to) {
      return;
    }

    this._transitionElapsed += deltaTime;
    const t = Math.min(this._transitionElapsed / this._transitionDuration, 1);
    this.state = lerpState(from, to, t, this.state);

    if (t >= 1) {
      this.state = cloneState(to);
      this._transitionFrom = null;
      this._transitionTo = null;
      this._transitionDuration = 0;
      this._transitionElapsed = 0;
    }
  }

  private _applyToScene(state: EnvironmentState): void {
    const scene = this._scene;
    const sun = scene.sun;
    const sunDirection = normalizeOrDefault(state.sunDirection, EnvironmentLighting._defaultSunDirection);

    if (sun) {
      sun.color.set(
        state.sunColor.r * state.sunIntensity,
        state.sunColor.g * state.sunIntensity,
        state.sunColor.b * state.sunIntensity,
        state.sunColor.a
      );
      sun.shadowStrength = state.shadowStrength;
      const sunTransform = sun.entity.transform;
      Vector3.add(sunTransform.worldPosition, sunDirection, EnvironmentLighting._tempSunTarget);
      sunTransform.lookAt(EnvironmentLighting._tempSunTarget, EnvironmentLighting._up);
    }

    const skyMaterial = scene.background.sky.material;
    if (skyMaterial && "skyTint" in skyMaterial) {
      const proceduralSkyMaterial = skyMaterial as SkyProceduralMaterial;
      proceduralSkyMaterial.skyTint = state.skyTint;
      proceduralSkyMaterial.groundTint = state.groundTint;
      proceduralSkyMaterial.exposure = state.skyExposure;
      proceduralSkyMaterial.atmosphereThickness = state.atmosphereThickness;
    }

    const ambientLight = scene.ambientLight;
    ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
    ambientLight.diffuseSphericalHarmonics = state.ambientSH || this._generateSkySH(state, this._generatedSH);
    ambientLight.diffuseIntensity = state.ambientIntensity;
    ambientLight.specularTexture = state.iblTexture || null;
    ambientLight.specularIntensity = state.iblIntensity;

    scene.fogMode = state.fogMode;
    scene.fogColor = state.fogColor;
    scene.fogDensity = state.fogDensity;

    const ao = scene.ambientOcclusion;
    ao.enabled = state.aoEnabled;
    ao.intensity = state.aoIntensity;
    ao.radius = state.aoRadius;
    ao.power = state.aoPower;
  }

  private _generateSkySH(state: EnvironmentState, out: SphericalHarmonics3): SphericalHarmonics3 {
    out.coefficients.fill(0);

    const weather = getWeatherProfile(state.weather);
    const dayFactor = getDayFactor(state.timeOfDay);
    const directionality = weather.directionality * (0.35 + 0.65 * dayFactor);
    const skyColor = copyColor(EnvironmentLightingSkyTemp.sky, state.skyTint, weather.sky * (0.25 + dayFactor));
    const groundColor = copyColor(
      EnvironmentLightingSkyTemp.ground,
      state.groundTint,
      weather.ground * (0.18 + 0.6 * dayFactor)
    );
    const sunColor = copyColor(
      EnvironmentLightingSkyTemp.sun,
      state.sunColor,
      state.sunIntensity * weather.sun * dayFactor * directionality
    );

    out.addLight(EnvironmentLightingSkyTemp.up, skyColor, Math.PI * (1.0 - 0.25 * directionality));
    out.addLight(EnvironmentLightingSkyTemp.down, groundColor, Math.PI * 0.7);
    Vector3.scale(
      normalizeOrDefault(state.sunDirection, EnvironmentLighting._defaultSunDirection),
      -1,
      EnvironmentLighting._tempSkySunDirection
    );
    out.addLight(EnvironmentLighting._tempSkySunDirection, sunColor, 0.45);
    return out;
  }
}

/**
 * Options for deriving a complete environment state.
 */
export type EnvironmentStateOptions = Partial<EnvironmentState> & {
  timeOfDay?: number;
  weather?: EnvironmentWeather;
};

function deriveState(options: EnvironmentStateOptions): EnvironmentState {
  const timeOfDay = wrap01(options.timeOfDay ?? 0.5);
  const weather = options.weather ?? "clear";
  const weatherProfile = getWeatherProfile(weather);
  const dayFactor = getDayFactor(timeOfDay);
  const sunsetFactor = getSunsetFactor(timeOfDay);
  const nightFactor = 1.0 - dayFactor;

  const sunDirection = options.sunDirection?.clone() || createSunDirection(timeOfDay);
  const skyTint =
    options.skyTint?.clone() || lerpColor(new Color(0.03, 0.05, 0.11, 1), new Color(0.45, 0.62, 0.95, 1), dayFactor);
  Color.lerp(skyTint, new Color(1.0, 0.47, 0.22, 1), sunsetFactor * 0.55, skyTint);
  Color.lerp(skyTint, weatherProfile.skyTint, weatherProfile.skyTintBlend, skyTint);

  const groundTint =
    options.groundTint?.clone() ||
    lerpColor(new Color(0.018, 0.017, 0.018, 1), new Color(0.32, 0.28, 0.22, 1), Math.max(dayFactor, 0.15));
  Color.lerp(groundTint, weatherProfile.groundTint, weatherProfile.groundTintBlend, groundTint);

  const sunColor =
    options.sunColor?.clone() || lerpColor(new Color(0.13, 0.17, 0.32, 1), new Color(1.0, 0.93, 0.78, 1), dayFactor);
  Color.lerp(sunColor, new Color(1.0, 0.42, 0.18, 1), sunsetFactor * 0.65, sunColor);
  Color.lerp(sunColor, weatherProfile.sunTint, weatherProfile.sunTintBlend, sunColor);

  const fogColor = options.fogColor?.clone() || skyTint.clone();
  Color.lerp(fogColor, weatherProfile.fogTint, weatherProfile.fogTintBlend, fogColor);

  return {
    timeOfDay,
    weather,
    sunDirection,
    sunColor,
    sunIntensity: options.sunIntensity ?? Math.max(0.02, dayFactor * weatherProfile.sun),
    shadowStrength: options.shadowStrength ?? Math.max(0, Math.min(1, dayFactor * weatherProfile.shadow)),
    skyTint,
    groundTint,
    skyExposure: options.skyExposure ?? Math.max(0.05, (0.35 + 1.15 * dayFactor) * weatherProfile.exposure),
    atmosphereThickness: options.atmosphereThickness ?? weatherProfile.atmosphereThickness,
    ambientSH: options.ambientSH?.clone(),
    ambientIntensity: options.ambientIntensity ?? Math.max(0.05, (0.18 + 0.85 * dayFactor) * weatherProfile.ambient),
    iblTexture: options.iblTexture,
    iblIntensity: options.iblIntensity ?? Math.max(0.03, (0.12 + 0.95 * dayFactor) * weatherProfile.ibl),
    fogMode: options.fogMode ?? weatherProfile.fogMode,
    fogColor,
    fogDensity: options.fogDensity ?? weatherProfile.fogDensity + nightFactor * 0.002,
    aoEnabled: options.aoEnabled ?? weatherProfile.aoEnabled,
    aoIntensity: options.aoIntensity ?? weatherProfile.aoIntensity,
    aoRadius: options.aoRadius ?? weatherProfile.aoRadius,
    aoPower: options.aoPower ?? weatherProfile.aoPower
  };
}

function cloneState(state: EnvironmentState): EnvironmentState {
  return {
    timeOfDay: state.timeOfDay,
    weather: state.weather,
    sunDirection: state.sunDirection.clone(),
    sunColor: state.sunColor.clone(),
    sunIntensity: state.sunIntensity,
    shadowStrength: state.shadowStrength,
    skyTint: state.skyTint.clone(),
    groundTint: state.groundTint.clone(),
    skyExposure: state.skyExposure,
    atmosphereThickness: state.atmosphereThickness,
    ambientSH: state.ambientSH?.clone(),
    ambientIntensity: state.ambientIntensity,
    iblTexture: state.iblTexture,
    iblIntensity: state.iblIntensity,
    fogMode: state.fogMode,
    fogColor: state.fogColor.clone(),
    fogDensity: state.fogDensity,
    aoEnabled: state.aoEnabled,
    aoIntensity: state.aoIntensity,
    aoRadius: state.aoRadius,
    aoPower: state.aoPower
  };
}

function lerpState(from: EnvironmentState, to: EnvironmentState, t: number, out: EnvironmentState): EnvironmentState {
  Vector3.lerp(from.sunDirection, to.sunDirection, t, out.sunDirection);
  out.sunDirection.normalize();
  Color.lerp(from.sunColor, to.sunColor, t, out.sunColor);
  Color.lerp(from.skyTint, to.skyTint, t, out.skyTint);
  Color.lerp(from.groundTint, to.groundTint, t, out.groundTint);
  Color.lerp(from.fogColor, to.fogColor, t, out.fogColor);

  out.timeOfDay = lerpNumber(from.timeOfDay, to.timeOfDay, t);
  out.weather = t < 1 ? from.weather : to.weather;
  out.sunIntensity = lerpNumber(from.sunIntensity, to.sunIntensity, t);
  out.shadowStrength = lerpNumber(from.shadowStrength, to.shadowStrength, t);
  out.skyExposure = lerpNumber(from.skyExposure, to.skyExposure, t);
  out.atmosphereThickness = lerpNumber(from.atmosphereThickness, to.atmosphereThickness, t);
  out.ambientSH = t < 1 ? from.ambientSH?.clone() : to.ambientSH?.clone();
  out.ambientIntensity = lerpNumber(from.ambientIntensity, to.ambientIntensity, t);
  out.iblTexture = t < 0.5 ? from.iblTexture : to.iblTexture;
  out.iblIntensity = lerpNumber(from.iblIntensity, to.iblIntensity, t);
  out.fogMode = t < 0.5 ? from.fogMode : to.fogMode;
  out.fogDensity = lerpNumber(from.fogDensity, to.fogDensity, t);
  out.aoEnabled = t < 0.5 ? from.aoEnabled : to.aoEnabled;
  out.aoIntensity = lerpNumber(from.aoIntensity, to.aoIntensity, t);
  out.aoRadius = lerpNumber(from.aoRadius, to.aoRadius, t);
  out.aoPower = lerpNumber(from.aoPower, to.aoPower, t);
  return out;
}

function createSunDirection(timeOfDay: number): Vector3 {
  const angle = wrap01(timeOfDay - 0.25) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const horizon = Math.max(0.15, Math.cos(Math.asin(Math.max(-1, Math.min(1, elevation)))));
  return new Vector3(0.35 * horizon, -elevation, 0.65 * horizon).normalize();
}

function normalizeOrDefault(value: Vector3, fallback: Vector3): Vector3 {
  if (value.lengthSquared() > 1e-8) {
    return value.normalize();
  }
  return fallback;
}

function getDayFactor(timeOfDay: number): number {
  return Math.max(0, Math.sin(wrap01(timeOfDay - 0.25) * Math.PI * 2));
}

function getSunsetFactor(timeOfDay: number): number {
  const dawn = Math.max(0, 1 - Math.abs(wrap01(timeOfDay) - 0.25) / 0.13);
  const dusk = Math.max(0, 1 - Math.abs(wrap01(timeOfDay) - 0.75) / 0.13);
  return Math.max(dawn, dusk);
}

function getWeatherProfile(weather: EnvironmentWeather): WeatherProfile {
  switch (weather) {
    case "cloudy":
      return WeatherProfiles.cloudy;
    case "rain":
      return WeatherProfiles.rain;
    case "fog":
      return WeatherProfiles.fog;
    case "storm":
      return WeatherProfiles.storm;
    default:
      return WeatherProfiles.clear;
  }
}

function copyColor(out: Color, source: Color, scale: number): Color {
  out.copyFrom(source);
  out.scale(scale);
  return out;
}

function lerpColor(start: Color, end: Color, t: number): Color {
  return Color.lerp(start, end, t, new Color());
}

function lerpNumber(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function wrap01(value: number): number {
  return value - Math.floor(value);
}

interface WeatherProfile {
  sun: number;
  shadow: number;
  ambient: number;
  ibl: number;
  exposure: number;
  sky: number;
  ground: number;
  directionality: number;
  atmosphereThickness: number;
  fogMode: FogMode;
  fogDensity: number;
  fogTint: Color;
  fogTintBlend: number;
  skyTint: Color;
  skyTintBlend: number;
  groundTint: Color;
  groundTintBlend: number;
  sunTint: Color;
  sunTintBlend: number;
  aoEnabled: boolean;
  aoIntensity: number;
  aoRadius: number;
  aoPower: number;
}

const WeatherProfiles: Record<EnvironmentWeather, WeatherProfile> = {
  clear: {
    sun: 1,
    shadow: 1,
    ambient: 1,
    ibl: 1,
    exposure: 1,
    sky: 1,
    ground: 1,
    directionality: 1,
    atmosphereThickness: 1,
    fogMode: FogMode.None,
    fogDensity: 0.001,
    fogTint: new Color(0.55, 0.68, 0.9, 1),
    fogTintBlend: 0.1,
    skyTint: new Color(0.45, 0.62, 0.95, 1),
    skyTintBlend: 0,
    groundTint: new Color(0.32, 0.28, 0.22, 1),
    groundTintBlend: 0,
    sunTint: new Color(1, 0.95, 0.82, 1),
    sunTintBlend: 0,
    aoEnabled: false,
    aoIntensity: 1,
    aoRadius: 0.3,
    aoPower: 1
  },
  cloudy: {
    sun: 0.38,
    shadow: 0.45,
    ambient: 0.85,
    ibl: 0.75,
    exposure: 0.78,
    sky: 0.78,
    ground: 0.8,
    directionality: 0.35,
    atmosphereThickness: 1.55,
    fogMode: FogMode.Exponential,
    fogDensity: 0.004,
    fogTint: new Color(0.46, 0.51, 0.56, 1),
    fogTintBlend: 0.35,
    skyTint: new Color(0.43, 0.48, 0.55, 1),
    skyTintBlend: 0.62,
    groundTint: new Color(0.27, 0.27, 0.25, 1),
    groundTintBlend: 0.45,
    sunTint: new Color(0.78, 0.82, 0.86, 1),
    sunTintBlend: 0.55,
    aoEnabled: true,
    aoIntensity: 1.1,
    aoRadius: 0.45,
    aoPower: 1.2
  },
  rain: {
    sun: 0.22,
    shadow: 0.35,
    ambient: 0.72,
    ibl: 0.65,
    exposure: 0.62,
    sky: 0.62,
    ground: 0.7,
    directionality: 0.25,
    atmosphereThickness: 1.8,
    fogMode: FogMode.Exponential,
    fogDensity: 0.011,
    fogTint: new Color(0.32, 0.36, 0.4, 1),
    fogTintBlend: 0.55,
    skyTint: new Color(0.28, 0.33, 0.39, 1),
    skyTintBlend: 0.72,
    groundTint: new Color(0.2, 0.22, 0.21, 1),
    groundTintBlend: 0.55,
    sunTint: new Color(0.58, 0.63, 0.7, 1),
    sunTintBlend: 0.72,
    aoEnabled: true,
    aoIntensity: 1.22,
    aoRadius: 0.55,
    aoPower: 1.25
  },
  fog: {
    sun: 0.18,
    shadow: 0.2,
    ambient: 0.62,
    ibl: 0.5,
    exposure: 0.58,
    sky: 0.58,
    ground: 0.5,
    directionality: 0.12,
    atmosphereThickness: 2.35,
    fogMode: FogMode.ExponentialSquared,
    fogDensity: 0.035,
    fogTint: new Color(0.62, 0.64, 0.62, 1),
    fogTintBlend: 0.82,
    skyTint: new Color(0.62, 0.64, 0.62, 1),
    skyTintBlend: 0.78,
    groundTint: new Color(0.42, 0.42, 0.38, 1),
    groundTintBlend: 0.62,
    sunTint: new Color(0.8, 0.78, 0.68, 1),
    sunTintBlend: 0.62,
    aoEnabled: true,
    aoIntensity: 0.75,
    aoRadius: 0.4,
    aoPower: 1
  },
  storm: {
    sun: 0.08,
    shadow: 0.18,
    ambient: 0.48,
    ibl: 0.42,
    exposure: 0.42,
    sky: 0.48,
    ground: 0.45,
    directionality: 0.18,
    atmosphereThickness: 2.1,
    fogMode: FogMode.Exponential,
    fogDensity: 0.018,
    fogTint: new Color(0.16, 0.19, 0.23, 1),
    fogTintBlend: 0.72,
    skyTint: new Color(0.13, 0.16, 0.22, 1),
    skyTintBlend: 0.82,
    groundTint: new Color(0.11, 0.12, 0.13, 1),
    groundTintBlend: 0.7,
    sunTint: new Color(0.38, 0.44, 0.55, 1),
    sunTintBlend: 0.82,
    aoEnabled: true,
    aoIntensity: 1.3,
    aoRadius: 0.62,
    aoPower: 1.3
  }
};

const EnvironmentLightingSkyTemp = {
  up: new Vector3(0, 1, 0),
  down: new Vector3(0, -1, 0),
  sky: new Color(),
  ground: new Color(),
  sun: new Color()
};
