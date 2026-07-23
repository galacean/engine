import type { WaterOpticalProfile, WaterOpticalRgb } from "./WaterOpticalProfile";
import { createWaterSurfaceOpticsResult, evaluateWaterSurfaceOptics } from "./WaterSurfaceOpticsMath";
import type { WaterSurfaceOpticsResult } from "./WaterSurfaceOpticsTypes";

const CONFIRM_PREDICTION_ERROR = 3 / 255;
const CONFIRM_TARGET_ERROR = 5 / 255;
const DISPROVE_TARGET_ERROR = 2 / 255;

export const WATER_OPTICS_REFERENCE_PIXEL_MAXIMUM_ERROR = 2 / 255;

export type WaterOpticsCompositionDecision =
  | "repeated-background-confirmed"
  | "legacy-target-confirmed"
  | "inconclusive";

export interface WaterOpticsCompositionPixelEvidence {
  /** Centered opaque background sample B, in linear RGB. */
  readonly centeredOpaqueColor: WaterOpticalRgb;
  /** Displaced opaque background sample D, in linear RGB. */
  readonly displacedOpaqueColor: WaterOpticalRgb;
  /** Shader-composited target color C, in linear RGB. */
  readonly shaderCompositedColor: WaterOpticalRgb;
  /** Shader output coverage/alpha A. */
  readonly surfaceAlpha: number;
  /** Final framebuffer color F, in linear RGB. */
  readonly finalFramebufferColor: WaterOpticalRgb;
  /** Pixel must be within the stable water interior, never an edge/foam sample. */
  readonly stableInterior: boolean;
  /** External ROI analysis found a visible coverage halo. */
  readonly edgeHalo: boolean;
}

export interface WaterOpticsCompositionAnalysis {
  readonly valid: boolean;
  readonly decision: WaterOpticsCompositionDecision;
  readonly predictedLegacyFramebufferColor: WaterOpticalRgb;
  readonly predictionError: number;
  readonly targetError: number;
  readonly displacedToTargetError: number;
  readonly reason: string;
}

export interface WaterOpticsReferencePixelEvidence {
  readonly profile: WaterOpticalProfile;
  /** Clamped shader optical depth, in metres. */
  readonly opticalDistance: number;
  /** Shader surface normal dot view direction, in [0, 1]. */
  readonly normalDotView: number;
  /** Validity-resolved centered/displaced opaque sample used by the reference path. */
  readonly sourceColor: WaterOpticalRgb;
  /** Exact resolved Sky/Probe/Planar sample used by the reference path. */
  readonly reflectionColor: WaterOpticalRgb;
  /** Shader-composited calibration output C, before framebuffer blending. */
  readonly shaderCompositedColor: WaterOpticalRgb;
  /** Pixel must be within the stable water interior, never an edge/foam sample. */
  readonly stableInterior: boolean;
}

export interface WaterOpticsReferencePixelAnalysis {
  readonly valid: boolean;
  readonly passed: boolean;
  readonly cpuReferenceColor: WaterOpticalRgb;
  readonly maximumChannelError: number;
  readonly threshold: number;
  /** Frozen result produced by the shared CPU surface-optics evaluator. */
  readonly cpuResult: Readonly<WaterSurfaceOpticsResult>;
  readonly reason: string;
}

function isFiniteLinearRgb(color: WaterOpticalRgb): boolean {
  return color.every((channel) => Number.isFinite(channel) && channel >= 0);
}

function maximumChannelError(left: WaterOpticalRgb, right: WaterOpticalRgb): number {
  return Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]), Math.abs(left[2] - right[2]));
}

function freezeWaterSurfaceOpticsResult(result: WaterSurfaceOpticsResult): Readonly<WaterSurfaceOpticsResult> {
  Object.freeze(result.transmittance);
  Object.freeze(result.scattering);
  Object.freeze(result.transmittedColor);
  Object.freeze(result.finalColor);
  return Object.freeze(result);
}

function invalidWaterOpticsReferencePixelAnalysis(): WaterOpticsReferencePixelAnalysis {
  const cpuResult = freezeWaterSurfaceOpticsResult(createWaterSurfaceOpticsResult());
  return Object.freeze({
    valid: false,
    passed: false,
    cpuReferenceColor: Object.freeze([0, 0, 0] as const),
    maximumChannelError: Number.POSITIVE_INFINITY,
    threshold: WATER_OPTICS_REFERENCE_PIXEL_MAXIMUM_ERROR,
    cpuResult,
    reason:
      "Evidence must be finite linear RGB from a stable interior pixel with optical distance >= 0 and normalDotView in [0, 1]."
  });
}

/** Compares one captured shader calibration pixel against the shared CPU optics evaluator. */
export function analyzeWaterOpticsReferencePixel(
  evidence: WaterOpticsReferencePixelEvidence
): WaterOpticsReferencePixelAnalysis {
  const valid =
    evidence.stableInterior &&
    Number.isFinite(evidence.opticalDistance) &&
    evidence.opticalDistance >= 0 &&
    Number.isFinite(evidence.normalDotView) &&
    evidence.normalDotView >= 0 &&
    evidence.normalDotView <= 1 &&
    isFiniteLinearRgb(evidence.sourceColor) &&
    isFiniteLinearRgb(evidence.reflectionColor) &&
    isFiniteLinearRgb(evidence.shaderCompositedColor);
  if (!valid) return invalidWaterOpticsReferencePixelAnalysis();

  const result = createWaterSurfaceOpticsResult();
  evaluateWaterSurfaceOptics(
    evidence.profile,
    evidence.opticalDistance,
    evidence.normalDotView,
    { red: evidence.sourceColor[0], green: evidence.sourceColor[1], blue: evidence.sourceColor[2] },
    { red: evidence.reflectionColor[0], green: evidence.reflectionColor[1], blue: evidence.reflectionColor[2] },
    result
  );
  const cpuReferenceColor = Object.freeze([
    result.finalColor.red,
    result.finalColor.green,
    result.finalColor.blue
  ] as const);
  const error = maximumChannelError(evidence.shaderCompositedColor, cpuReferenceColor);
  const passed = error <= WATER_OPTICS_REFERENCE_PIXEL_MAXIMUM_ERROR;
  return Object.freeze({
    valid: true,
    passed,
    cpuReferenceColor,
    maximumChannelError: error,
    threshold: WATER_OPTICS_REFERENCE_PIXEL_MAXIMUM_ERROR,
    cpuResult: freezeWaterSurfaceOpticsResult(result),
    reason: passed
      ? "Shader-composited color matches the shared CPU surface-optics reference within 2/255."
      : "Shader-composited color exceeds the frozen 2/255 CPU-reference threshold."
  });
}

export function analyzeWaterOpticsCompositionPixel(
  evidence: WaterOpticsCompositionPixelEvidence
): WaterOpticsCompositionAnalysis {
  const alpha = evidence.surfaceAlpha;
  const valid =
    evidence.stableInterior &&
    Number.isFinite(alpha) &&
    alpha >= 0 &&
    alpha <= 1 &&
    isFiniteLinearRgb(evidence.centeredOpaqueColor) &&
    isFiniteLinearRgb(evidence.displacedOpaqueColor) &&
    isFiniteLinearRgb(evidence.shaderCompositedColor) &&
    isFiniteLinearRgb(evidence.finalFramebufferColor);
  if (!valid) {
    return Object.freeze({
      valid: false,
      decision: "inconclusive",
      predictedLegacyFramebufferColor: Object.freeze([0, 0, 0] as const),
      predictionError: Number.POSITIVE_INFINITY,
      targetError: Number.POSITIVE_INFINITY,
      displacedToTargetError: Number.POSITIVE_INFINITY,
      reason: "Evidence must be finite linear RGB from a stable interior pixel with alpha in [0, 1]."
    });
  }

  const backgroundWeight = 1 - alpha;
  const predicted = Object.freeze([
    alpha * evidence.shaderCompositedColor[0] + backgroundWeight * evidence.centeredOpaqueColor[0],
    alpha * evidence.shaderCompositedColor[1] + backgroundWeight * evidence.centeredOpaqueColor[1],
    alpha * evidence.shaderCompositedColor[2] + backgroundWeight * evidence.centeredOpaqueColor[2]
  ] as const);
  const predictionError = maximumChannelError(evidence.finalFramebufferColor, predicted);
  const targetError = maximumChannelError(evidence.finalFramebufferColor, evidence.shaderCompositedColor);
  const displacedToTargetError = maximumChannelError(evidence.displacedOpaqueColor, evidence.shaderCompositedColor);

  if (predictionError <= CONFIRM_PREDICTION_ERROR && targetError > CONFIRM_TARGET_ERROR) {
    return Object.freeze({
      valid: true,
      decision: "repeated-background-confirmed",
      predictedLegacyFramebufferColor: predicted,
      predictionError,
      targetError,
      displacedToTargetError,
      reason: "F matches A*C + (1-A)*B while materially differing from the intended shader-composited color C."
    });
  }
  if (targetError <= DISPROVE_TARGET_ERROR && !evidence.edgeHalo) {
    return Object.freeze({
      valid: true,
      decision: "legacy-target-confirmed",
      predictedLegacyFramebufferColor: predicted,
      predictionError,
      targetError,
      displacedToTargetError,
      reason: "F already matches C within the frozen interior threshold and the ROI has no edge halo."
    });
  }
  return Object.freeze({
    valid: true,
    decision: "inconclusive",
    predictedLegacyFramebufferColor: predicted,
    predictionError,
    targetError,
    displacedToTargetError,
    reason: "The pixel does not meet either frozen P0-02 decision threshold; collect another stable ROI sample."
  });
}
