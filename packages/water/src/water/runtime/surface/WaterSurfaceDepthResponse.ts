/** CPU reference for the bounded, vendor-neutral Surface Appearance V2 depth response. */
import {
  WaterDepthResponseCombineV2,
  WaterSurfaceDepthResponseModelV2,
  type WaterSurfaceAppearanceColor,
  type WaterSurfaceCompositeExponentialDepthResponseV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import type { WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";

export enum WaterDepthResponseTermMode {
  Dual = "dual",
  SceneRayOnly = "scene-ray-only",
  SurfaceNormalOnly = "surface-normal-only",
  Off = "off"
}

export enum WaterDepthResponseDebugView {
  Final = 0,
  SceneRayDepth = 1,
  SurfaceNormalDepth = 2,
  SceneRayTerm = 3,
  SurfaceNormalTerm = 4,
  Density = 5
}

export interface WaterCompositeExponentialDepthReadback {
  readonly scaledTerms: readonly [number, number?];
  readonly density: number;
  readonly color: WaterSurfaceAppearanceColor;
}

export interface WaterCameraDepthReconstructionInput {
  readonly projection: "perspective" | "orthographic";
  readonly surfacePosition: readonly [number, number, number];
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraForward: readonly [number, number, number];
  readonly surfaceEyeDepth: number;
  readonly sceneEyeDepth: number;
  readonly depthSampleValid: boolean;
}

export interface WaterCameraDepthReconstructionReadback {
  readonly valid: boolean;
  readonly sceneEyeDepth: number;
  readonly sceneRayDepth: number;
  readonly opaquePosition: readonly [number, number, number];
}

function finiteNonNegative(value: number, path: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${path} must be finite and non-negative.`);
  return value;
}

function normalize3(value: readonly [number, number, number], path: string): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 1e-8) throw new RangeError(`${path} must be a finite non-zero vector.`);
  return Object.freeze([value[0] / length, value[1] / length, value[2] / length] as const);
}

export function evaluateWaterCompositeExponentialDepthResponse(
  response: Readonly<WaterSurfaceCompositeExponentialDepthResponseV2>,
  fields: Readonly<Partial<Record<WaterFieldSemantic, number>>>
): Readonly<WaterCompositeExponentialDepthReadback> {
  if (
    response.model !== WaterSurfaceDepthResponseModelV2.CompositeExponential ||
    response.combine !== WaterDepthResponseCombineV2.Maximum
  ) {
    throw new TypeError("Expected a maximum CompositeExponential depth response.");
  }
  const scaled: [number, number?] = [0];
  for (let index = 0; index < response.terms.length; index++) {
    const term = response.terms[index];
    if (!term) continue;
    const fieldValue = fields[term.field];
    if (fieldValue === undefined) throw new Error(`Missing depth field '${term.field}'.`);
    scaled[index] =
      finiteNonNegative(fieldValue, `fields.${term.field}`) *
      finiteNonNegative(term.coefficientPerMeter, `response.terms[${index}].coefficientPerMeter`);
  }
  const density = Math.min(1, Math.max(0, 1 - Math.exp(-Math.max(scaled[0], scaled[1] ?? 0))));
  const color = Object.freeze([
    response.shallowColor[0] * (1 - density) + response.deepColor[0] * density,
    response.shallowColor[1] * (1 - density) + response.deepColor[1] * density,
    response.shallowColor[2] * (1 - density) + response.deepColor[2] * density,
    response.shallowColor[3] * (1 - density) + response.deepColor[3] * density
  ] as const);
  return Object.freeze({ scaledTerms: Object.freeze(scaled), density, color });
}

/** Resolves surface-normal depth after normal normalization. See `third_party/water-depth-provenance`. */
export function calculateWaterSurfaceNormalDepth(
  surfacePosition: readonly [number, number, number],
  opaquePosition: readonly [number, number, number],
  macroNormal: readonly [number, number, number]
): number {
  const normal = normalize3(macroNormal, "macroNormal");
  return Math.abs(
    (surfacePosition[0] - opaquePosition[0]) * normal[0] +
      (surfacePosition[1] - opaquePosition[1]) * normal[1] +
      (surfacePosition[2] - opaquePosition[2]) * normal[2]
  );
}

/** Perspective and orthographic reconstruction used by the shared Camera Depth provider. */
export function reconstructWaterOpaquePosition(
  input: Readonly<WaterCameraDepthReconstructionInput>
): Readonly<WaterCameraDepthReconstructionReadback> {
  const surfacePosition = (): readonly [number, number, number] =>
    Object.freeze([input.surfacePosition[0], input.surfacePosition[1], input.surfacePosition[2]] as const);
  if (!input.depthSampleValid || !Number.isFinite(input.sceneEyeDepth) || !Number.isFinite(input.surfaceEyeDepth)) {
    return Object.freeze({ valid: false, sceneEyeDepth: 0, sceneRayDepth: 0, opaquePosition: surfacePosition() });
  }
  const sceneEyeDepth = Math.max(input.sceneEyeDepth - input.surfaceEyeDepth, 0);
  if (sceneEyeDepth <= 0) {
    return Object.freeze({ valid: false, sceneEyeDepth: 0, sceneRayDepth: 0, opaquePosition: surfacePosition() });
  }
  let opaquePosition: readonly [number, number, number];
  if (input.projection === "orthographic") {
    const forward = normalize3(input.cameraForward, "cameraForward");
    opaquePosition = Object.freeze([
      input.surfacePosition[0] + forward[0] * sceneEyeDepth,
      input.surfacePosition[1] + forward[1] * sceneEyeDepth,
      input.surfacePosition[2] + forward[2] * sceneEyeDepth
    ] as const);
  } else {
    if (input.surfaceEyeDepth <= 1e-8) {
      return Object.freeze({ valid: false, sceneEyeDepth: 0, sceneRayDepth: 0, opaquePosition: surfacePosition() });
    }
    const ratio = input.sceneEyeDepth / input.surfaceEyeDepth;
    opaquePosition = Object.freeze([
      input.cameraPosition[0] + (input.surfacePosition[0] - input.cameraPosition[0]) * ratio,
      input.cameraPosition[1] + (input.surfacePosition[1] - input.cameraPosition[1]) * ratio,
      input.cameraPosition[2] + (input.surfacePosition[2] - input.cameraPosition[2]) * ratio
    ] as const);
  }
  const sceneRayDepth = Math.hypot(...opaquePosition.map((value, axis) => value - input.surfacePosition[axis]));
  return Object.freeze({ valid: true, sceneEyeDepth, sceneRayDepth, opaquePosition });
}
