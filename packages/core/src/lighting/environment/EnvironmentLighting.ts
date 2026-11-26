import { Color, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import type { Scene } from "../../Scene";
import type { Transform } from "../../Transform";
import type { ShaderData } from "../../shader/ShaderData";
import type { SkyProceduralMaterial } from "../../sky/SkyProceduralMaterial";
import { FogMode } from "../../enums/FogMode";
import { DiffuseMode } from "../enums/DiffuseMode";
import type { EnvironmentState } from "./EnvironmentState";
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
    return {
      sunDirection: new Vector3(0.35, -0.8, 0.35).normalize(),
      sunColor: new Color(1, 0.93, 0.78, 1),
      sunIntensity: 1,
      shadowStrength: 1,
      skyTint: new Color(0.45, 0.62, 0.95, 1),
      groundTint: new Color(0.32, 0.28, 0.22, 1),
      skyExposure: 1.5,
      atmosphereThickness: 1,
      ambientDirectionality: 0.65,
      ambientIntensity: 1,
      iblIntensity: 1,
      fogMode: FogMode.None,
      fogColor: new Color(0.55, 0.68, 0.9, 1),
      fogDensity: 0.001,
      aoEnabled: false,
      aoIntensity: 1,
      aoRadius: 0.3,
      aoPower: 1
    };
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

    const directionality = clamp01(state.ambientDirectionality);
    const skyColor = copyColor(EnvironmentLightingSkyTemp.sky, state.skyTint, 1);
    const groundColor = copyColor(EnvironmentLightingSkyTemp.ground, state.groundTint, 0.7);
    const sunColor = copyColor(EnvironmentLightingSkyTemp.sun, state.sunColor, state.sunIntensity * directionality);

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

function cloneState(state: EnvironmentState): EnvironmentState {
  return {
    sunDirection: state.sunDirection.clone(),
    sunColor: state.sunColor.clone(),
    sunIntensity: state.sunIntensity,
    shadowStrength: state.shadowStrength,
    skyTint: state.skyTint.clone(),
    groundTint: state.groundTint.clone(),
    skyExposure: state.skyExposure,
    atmosphereThickness: state.atmosphereThickness,
    ambientSH: state.ambientSH?.clone(),
    ambientDirectionality: state.ambientDirectionality,
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

  out.sunIntensity = lerpNumber(from.sunIntensity, to.sunIntensity, t);
  out.shadowStrength = lerpNumber(from.shadowStrength, to.shadowStrength, t);
  out.skyExposure = lerpNumber(from.skyExposure, to.skyExposure, t);
  out.atmosphereThickness = lerpNumber(from.atmosphereThickness, to.atmosphereThickness, t);
  out.ambientSH = t < 1 ? from.ambientSH?.clone() : to.ambientSH?.clone();
  out.ambientDirectionality = lerpNumber(from.ambientDirectionality, to.ambientDirectionality, t);
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

function normalizeOrDefault(value: Vector3, fallback: Vector3): Vector3 {
  if (value.lengthSquared() > 1e-8) {
    return value.normalize();
  }
  return fallback;
}

function copyColor(out: Color, source: Color, scale: number): Color {
  out.copyFrom(source);
  out.scale(scale);
  return out;
}

function lerpNumber(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const EnvironmentLightingSkyTemp = {
  up: new Vector3(0, 1, 0),
  down: new Vector3(0, -1, 0),
  sky: new Color(),
  ground: new Color(),
  sun: new Color()
};
