import { DiffuseMode, type AmbientLight } from "@galacean/engine-core";
import { Color, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import {
  GRASSLANDS_ROTATED_DIRECT_LIGHT_FORWARD,
  type GrasslandsDirectLightState,
  type GrasslandsSceneController
} from "./GrasslandsSceneController.ts";
import type { GrasslandsVector3 } from "./GrasslandsPcgTypes.ts";

export type GrasslandsLightingPreset = "reference" | "all-off" | "direct-only" | "indirect-only" | "custom";

export type GrasslandsBuiltInLightingPreset = Exclude<GrasslandsLightingPreset, "custom">;
export type GrasslandsDiffuseLightingSource = "authored-sky-gradient" | "runtime-sky";

export interface GrasslandsDirectLightingState {
  readonly enabled: boolean;
  /** Authored sRGB color measured from the source scene. */
  readonly color: GrasslandsVector3;
  readonly intensity: number;
  readonly pitchDegrees: number;
  readonly yawDegrees: number;
}

export interface GrasslandsIndirectLightingState {
  readonly diffuseEnabled: boolean;
  /** Authored sRGB sky-gradient colors measured from the source scene. */
  readonly skyColor: GrasslandsVector3;
  readonly equatorColor: GrasslandsVector3;
  readonly groundColor: GrasslandsVector3;
  readonly diffuseIntensity: number;
}

export interface GrasslandsEnvironmentLightingState {
  readonly specularEnabled: boolean;
  readonly specularIntensity: number;
}

export interface GrasslandsLightingState {
  readonly preset: GrasslandsLightingPreset;
  readonly direct: Readonly<GrasslandsDirectLightingState>;
  readonly indirect: Readonly<GrasslandsIndirectLightingState>;
  readonly environment: Readonly<GrasslandsEnvironmentLightingState>;
}

export interface GrasslandsLightingReadback {
  readonly preset: GrasslandsLightingPreset;
  readonly authored: Omit<GrasslandsLightingState, "preset">;
  readonly effective: {
    readonly direct: {
      readonly enabled: boolean;
      readonly colorLinear: GrasslandsVector3;
      readonly intensity: number;
      readonly effectiveColorLinear: GrasslandsVector3;
      readonly forward: GrasslandsVector3;
    };
    readonly indirect: {
      readonly diffuseEnabled: boolean;
      readonly diffuseIntensity: number;
      readonly sphericalHarmonicsCoefficients: readonly number[];
    };
    readonly environment: {
      readonly specularEnabled: boolean;
      readonly specularIntensity: number;
    };
  };
  readonly matchesReference: boolean;
}

export const GRASSLANDS_SKY_GRADIENT_LATITUDE_SAMPLES = 16;
export const GRASSLANDS_SKY_GRADIENT_LONGITUDE_SAMPLES = 32;

const REFERENCE_DIRECT = Object.freeze({
  enabled: true,
  color: Object.freeze([1, 1, 1] as const),
  intensity: 1.05,
  pitchDegrees: 51.9,
  yawDegrees: 18.1
});

const REFERENCE_INDIRECT = Object.freeze({
  diffuseEnabled: true,
  skyColor: Object.freeze([0.3954248, 0.44771242, 0.5] as const),
  equatorColor: Object.freeze([0.5079518, 0.6021686, 0.68] as const),
  groundColor: Object.freeze([0.4, 0.4, 0.4] as const),
  diffuseIntensity: 0.9
});

const REFERENCE_ENVIRONMENT = Object.freeze({
  specularEnabled: true,
  specularIntensity: 1
});

export const GRASSLANDS_REFERENCE_LIGHTING = Object.freeze({
  preset: "reference" as const,
  direct: REFERENCE_DIRECT,
  indirect: REFERENCE_INDIRECT,
  environment: REFERENCE_ENVIRONMENT
});

const BUILT_IN_PRESETS: Readonly<Record<GrasslandsBuiltInLightingPreset, GrasslandsLightingState>> = Object.freeze({
  reference: GRASSLANDS_REFERENCE_LIGHTING,
  "all-off": Object.freeze({
    preset: "all-off" as const,
    direct: Object.freeze({ ...REFERENCE_DIRECT, enabled: false }),
    indirect: Object.freeze({ ...REFERENCE_INDIRECT, diffuseEnabled: false }),
    environment: Object.freeze({ ...REFERENCE_ENVIRONMENT, specularEnabled: false })
  }),
  "direct-only": Object.freeze({
    preset: "direct-only" as const,
    direct: REFERENCE_DIRECT,
    indirect: Object.freeze({ ...REFERENCE_INDIRECT, diffuseEnabled: false }),
    environment: Object.freeze({ ...REFERENCE_ENVIRONMENT, specularEnabled: false })
  }),
  "indirect-only": Object.freeze({
    preset: "indirect-only" as const,
    direct: Object.freeze({ ...REFERENCE_DIRECT, enabled: false }),
    indirect: REFERENCE_INDIRECT,
    environment: REFERENCE_ENVIRONMENT
  })
});

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const STATE_EPSILON = 1e-6;

function freezeVector3(x: number, y: number, z: number): GrasslandsVector3 {
  return Object.freeze([x, y, z] as const);
}

function cloneVector3(value: GrasslandsVector3): GrasslandsVector3 {
  return freezeVector3(value[0], value[1], value[2]);
}

function cloneState(state: GrasslandsLightingState, preset = state.preset): GrasslandsLightingState {
  return Object.freeze({
    preset,
    direct: Object.freeze({ ...state.direct, color: cloneVector3(state.direct.color) }),
    indirect: Object.freeze({
      ...state.indirect,
      skyColor: cloneVector3(state.indirect.skyColor),
      equatorColor: cloneVector3(state.indirect.equatorColor),
      groundColor: cloneVector3(state.indirect.groundColor)
    }),
    environment: Object.freeze({ ...state.environment })
  });
}

function requireFiniteRange(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
  if (value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function requireColor(name: string, value: GrasslandsVector3): GrasslandsVector3 {
  for (const channel of value) requireFiniteRange(name, channel, 0, 1);
  return cloneVector3(value);
}

function vectorMatches(left: GrasslandsVector3, right: GrasslandsVector3): boolean {
  return left.every((value, index) => Math.abs(value - right[index]) <= STATE_EPSILON);
}

function normalizedVector3(value: GrasslandsVector3): GrasslandsVector3 {
  const length = Math.hypot(...value);
  return freezeVector3(value[0] / length, value[1] / length, value[2] / length);
}

function numberMatches(left: number, right: number): boolean {
  return Math.abs(left - right) <= STATE_EPSILON;
}

function authoredStateMatches(left: GrasslandsLightingState, right: GrasslandsLightingState): boolean {
  return (
    left.direct.enabled === right.direct.enabled &&
    vectorMatches(left.direct.color, right.direct.color) &&
    numberMatches(left.direct.intensity, right.direct.intensity) &&
    numberMatches(left.direct.pitchDegrees, right.direct.pitchDegrees) &&
    numberMatches(left.direct.yawDegrees, right.direct.yawDegrees) &&
    left.indirect.diffuseEnabled === right.indirect.diffuseEnabled &&
    vectorMatches(left.indirect.skyColor, right.indirect.skyColor) &&
    vectorMatches(left.indirect.equatorColor, right.indirect.equatorColor) &&
    vectorMatches(left.indirect.groundColor, right.indirect.groundColor) &&
    numberMatches(left.indirect.diffuseIntensity, right.indirect.diffuseIntensity) &&
    left.environment.specularEnabled === right.environment.specularEnabled &&
    numberMatches(left.environment.specularIntensity, right.environment.specularIntensity)
  );
}

function resolvePreset(state: GrasslandsLightingState): GrasslandsLightingPreset {
  for (const [preset, authored] of Object.entries(BUILT_IN_PRESETS) as Array<
    [GrasslandsBuiltInLightingPreset, GrasslandsLightingState]
  >) {
    if (authoredStateMatches(state, authored)) return preset;
  }
  return "custom";
}

function colorSrgbToLinear(color: GrasslandsVector3): GrasslandsVector3 {
  return freezeVector3(
    Color.sRGBToLinearSpace(color[0]),
    Color.sRGBToLinearSpace(color[1]),
    Color.sRGBToLinearSpace(color[2])
  );
}

export function grasslandsLightingEulerToForward(pitchDegrees: number, yawDegrees: number): GrasslandsVector3 {
  requireFiniteRange("Direct pitch", pitchDegrees, -90, 90);
  requireFiniteRange("Direct yaw", yawDegrees, -180, 180);
  const pitch = pitchDegrees * DEGREES_TO_RADIANS;
  const yaw = yawDegrees * DEGREES_TO_RADIANS;
  const cosPitch = Math.cos(pitch);
  return freezeVector3(Math.sin(yaw) * cosPitch, -Math.sin(pitch), Math.cos(yaw) * cosPitch);
}

function forwardToEuler(forward: GrasslandsVector3): readonly [number, number] {
  const length = Math.hypot(...forward);
  const x = forward[0] / length;
  const y = forward[1] / length;
  const z = forward[2] / length;
  return Object.freeze([
    Math.asin(Math.min(1, Math.max(-1, -y))) * RADIANS_TO_DEGREES,
    Math.atan2(x, z) * RADIANS_TO_DEGREES
  ] as const);
}

export function projectGrasslandsSkyGradientToSphericalHarmonics(
  lighting: Pick<GrasslandsIndirectLightingState, "skyColor" | "equatorColor" | "groundColor">
): SphericalHarmonics3 {
  const harmonics = new SphericalHarmonics3();
  const sky = colorSrgbToLinear(requireColor("Sky-gradient sky color", lighting.skyColor));
  const equator = colorSrgbToLinear(requireColor("Sky-gradient equator color", lighting.equatorColor));
  const ground = colorSrgbToLinear(requireColor("Sky-gradient ground color", lighting.groundColor));
  const deltaTheta = Math.PI / GRASSLANDS_SKY_GRADIENT_LATITUDE_SAMPLES;
  const deltaPhi = (Math.PI * 2) / GRASSLANDS_SKY_GRADIENT_LONGITUDE_SAMPLES;

  for (let latitude = 0; latitude < GRASSLANDS_SKY_GRADIENT_LATITUDE_SAMPLES; latitude++) {
    const theta = (latitude + 0.5) * deltaTheta;
    const sinTheta = Math.sin(theta);
    const y = Math.cos(theta);
    const hemisphere = y >= 0 ? sky : ground;
    const weight = Math.abs(y);
    const r = equator[0] + (hemisphere[0] - equator[0]) * weight;
    const g = equator[1] + (hemisphere[1] - equator[1]) * weight;
    const b = equator[2] + (hemisphere[2] - equator[2]) * weight;
    const solidAngle = sinTheta * deltaTheta * deltaPhi;
    for (let longitude = 0; longitude < GRASSLANDS_SKY_GRADIENT_LONGITUDE_SAMPLES; longitude++) {
      const phi = (longitude + 0.5) * deltaPhi;
      harmonics.addLight(
        new Vector3(Math.sin(phi) * sinTheta, y, Math.cos(phi) * sinTheta),
        new Color(r, g, b, 1),
        solidAngle
      );
    }
  }
  return harmonics;
}

function createLightingReadback(
  state: GrasslandsLightingState,
  skyGradient: SphericalHarmonics3,
  actualForward: GrasslandsVector3
): GrasslandsLightingReadback {
  const directLinear = colorSrgbToLinear(state.direct.color);
  const effectiveDirectIntensity = state.direct.enabled ? state.direct.intensity : 0;
  const effectiveDiffuseIntensity = state.indirect.diffuseEnabled ? state.indirect.diffuseIntensity : 0;
  const effectiveSpecularIntensity = state.environment.specularEnabled ? state.environment.specularIntensity : 0;
  return Object.freeze({
    preset: state.preset,
    authored: Object.freeze({
      direct: state.direct,
      indirect: state.indirect,
      environment: state.environment
    }),
    effective: Object.freeze({
      direct: Object.freeze({
        enabled: state.direct.enabled,
        colorLinear: directLinear,
        intensity: effectiveDirectIntensity,
        effectiveColorLinear: freezeVector3(
          directLinear[0] * effectiveDirectIntensity,
          directLinear[1] * effectiveDirectIntensity,
          directLinear[2] * effectiveDirectIntensity
        ),
        forward: cloneVector3(actualForward)
      }),
      indirect: Object.freeze({
        diffuseEnabled: state.indirect.diffuseEnabled,
        diffuseIntensity: effectiveDiffuseIntensity,
        sphericalHarmonicsCoefficients: Object.freeze(Array.from(skyGradient.coefficients))
      }),
      environment: Object.freeze({
        specularEnabled: state.environment.specularEnabled,
        specularIntensity: effectiveSpecularIntensity
      })
    }),
    matchesReference: authoredStateMatches(state, GRASSLANDS_REFERENCE_LIGHTING)
  });
}

export function createGrasslandsReferenceLightingReadback(): GrasslandsLightingReadback {
  const state = cloneState(GRASSLANDS_REFERENCE_LIGHTING);
  return createLightingReadback(
    state,
    projectGrasslandsSkyGradientToSphericalHarmonics(state.indirect),
    grasslandsLightingEulerToForward(state.direct.pitchDegrees, state.direct.yawDegrees)
  );
}

function resolveDirectLightReadbackState(state: GrasslandsDirectLightingState): GrasslandsDirectLightState | "custom" {
  const reference = REFERENCE_DIRECT;
  const matchesReferenceValues =
    vectorMatches(state.color, reference.color) &&
    numberMatches(state.intensity, reference.intensity) &&
    numberMatches(state.pitchDegrees, reference.pitchDegrees) &&
    numberMatches(state.yawDegrees, reference.yawDegrees);
  if (!state.enabled) return "disabled";
  if (matchesReferenceValues) {
    return "default";
  }
  const forward = grasslandsLightingEulerToForward(state.pitchDegrees, state.yawDegrees);
  if (
    vectorMatches(forward, normalizedVector3(GRASSLANDS_ROTATED_DIRECT_LIGHT_FORWARD)) &&
    vectorMatches(state.color, reference.color) &&
    numberMatches(state.intensity, reference.intensity)
  ) {
    return "rotated";
  }
  return "custom";
}

export class GrasslandsLightingController {
  private _state: GrasslandsLightingState = cloneState(GRASSLANDS_REFERENCE_LIGHTING);
  private _skyGradientSignature = "";
  private _skyGradient = new SphericalHarmonics3();

  constructor(
    private readonly _ambientLight: AmbientLight,
    private readonly _sceneController: GrasslandsSceneController,
    readonly diffuseSource: GrasslandsDiffuseLightingSource = "authored-sky-gradient",
    private readonly _onLightingChanged?: () => void
  ) {
    this._apply();
  }

  get state(): GrasslandsLightingState {
    return this._state;
  }

  get readback(): GrasslandsLightingReadback {
    const forward = this._sceneController.directLightEntity.transform.worldForward;
    return createLightingReadback(this._state, this._skyGradient, freezeVector3(forward.x, forward.y, forward.z));
  }

  applyPreset(preset: GrasslandsBuiltInLightingPreset): void {
    if (!Object.hasOwn(BUILT_IN_PRESETS, preset)) {
      throw new RangeError(`Unknown Grasslands Lighting preset "${String(preset)}".`);
    }
    this._state = cloneState(BUILT_IN_PRESETS[preset]);
    this._apply();
  }

  updateDirect(patch: Partial<GrasslandsDirectLightingState>): void {
    const next = {
      ...this._state.direct,
      ...patch,
      color: patch.color ? requireColor("Direct color", patch.color) : this._state.direct.color
    };
    if (typeof next.enabled !== "boolean") throw new TypeError("Direct enabled must be boolean.");
    requireFiniteRange("Direct intensity", next.intensity, 0, 4);
    requireFiniteRange("Direct pitch", next.pitchDegrees, -90, 90);
    requireFiniteRange("Direct yaw", next.yawDegrees, -180, 180);
    this._setState({ ...this._state, direct: Object.freeze(next) });
  }

  updateIndirect(patch: Partial<GrasslandsIndirectLightingState>): void {
    const next = {
      ...this._state.indirect,
      ...patch,
      skyColor: patch.skyColor ? requireColor("Sky-gradient sky color", patch.skyColor) : this._state.indirect.skyColor,
      equatorColor: patch.equatorColor
        ? requireColor("Sky-gradient equator color", patch.equatorColor)
        : this._state.indirect.equatorColor,
      groundColor: patch.groundColor
        ? requireColor("Sky-gradient ground color", patch.groundColor)
        : this._state.indirect.groundColor
    };
    if (typeof next.diffuseEnabled !== "boolean") throw new TypeError("Indirect diffuse enabled must be boolean.");
    requireFiniteRange("Indirect diffuse intensity", next.diffuseIntensity, 0, 4);
    this._setState({ ...this._state, indirect: Object.freeze(next) });
  }

  updateEnvironment(patch: Partial<GrasslandsEnvironmentLightingState>): void {
    const next = { ...this._state.environment, ...patch };
    if (typeof next.specularEnabled !== "boolean") {
      throw new TypeError("Environment specular enabled must be boolean.");
    }
    requireFiniteRange("Environment specular intensity", next.specularIntensity, 0, 4);
    this._setState({ ...this._state, environment: Object.freeze(next) });
  }

  setDirectLightState(state: GrasslandsDirectLightState): void {
    if (state !== "default" && state !== "rotated" && state !== "disabled") {
      throw new RangeError(`Unknown Grasslands DirectLight state "${String(state)}".`);
    }
    const direct =
      state === "rotated"
        ? (() => {
            const [pitchDegrees, yawDegrees] = forwardToEuler(GRASSLANDS_ROTATED_DIRECT_LIGHT_FORWARD);
            return Object.freeze({ ...REFERENCE_DIRECT, pitchDegrees, yawDegrees });
          })()
        : Object.freeze({ ...REFERENCE_DIRECT, enabled: state !== "disabled" });
    this._setState({ ...this._state, direct });
  }

  private _setState(next: Omit<GrasslandsLightingState, "preset"> | GrasslandsLightingState): void {
    const candidate = cloneState({ ...next, preset: "custom" });
    this._state = cloneState(candidate, resolvePreset(candidate));
    this._apply();
  }

  private _apply(): void {
    const { direct, indirect, environment } = this._state;
    const colorLinear = colorSrgbToLinear(direct.color);
    const forward = grasslandsLightingEulerToForward(direct.pitchDegrees, direct.yawDegrees);
    this._sceneController.setDirectLightConfiguration({
      enabled: direct.enabled,
      colorLinear,
      intensity: direct.intensity,
      forward,
      state: resolveDirectLightReadbackState(direct)
    });

    const signature = JSON.stringify([indirect.skyColor, indirect.equatorColor, indirect.groundColor]);
    if (signature !== this._skyGradientSignature) {
      this._skyGradient = projectGrasslandsSkyGradientToSphericalHarmonics(indirect);
      this._skyGradientSignature = signature;
    }
    if (this.diffuseSource === "authored-sky-gradient") {
      this._ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
      this._ambientLight.diffuseSphericalHarmonics = this._skyGradient;
    }
    this._ambientLight.diffuseIntensity = indirect.diffuseEnabled ? indirect.diffuseIntensity : 0;
    this._ambientLight.specularIntensity = environment.specularEnabled ? environment.specularIntensity : 0;
    this._onLightingChanged?.();
  }
}
