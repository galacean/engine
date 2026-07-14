import { RiverNetworkSchemaVersion } from "../../authoring/river/RiverAuthoringEnums";
import {
  RIVER_SURFACE_MOTION_QUALITY_SCALE,
  RIVER_SURFACE_MOTION_STYLE_PRESET
} from "../../authoring/river/RiverAuthoringLimits";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import { hashRiverString } from "../shared/determinism";
import {
  RIVER_SURFACE_DERIVATIVE_STEP,
  RIVER_SURFACE_DOMAIN_WARP_SCALE,
  RIVER_SURFACE_DOMAIN_WARP_STRENGTH,
  RIVER_SURFACE_FLOW_EPSILON,
  RIVER_SURFACE_HASH_MULTIPLIER,
  RIVER_SURFACE_HASH_SEED_SCALE,
  RIVER_SURFACE_MACRO_NOISE,
  RIVER_SURFACE_REFERENCE_FLOW_SPEED,
  RIVER_SURFACE_TIME_DERIVATIVE_STEP
} from "./constants";
import type { RiverCompiledSurfaceMotionData } from "./types";

export interface RiverSurfaceMotionCoordinates {
  readonly signedAcrossDistance: number;
  readonly networkFlowTime: number;
  readonly halfWidth: number;
  readonly flowSpeed: number;
}

/** Caller-owned output used by dynamic scalar and batch queries. */
export interface RiverSurfaceMotionSampleOutput {
  height: number;
  acrossDerivative: number;
  downstreamDerivative: number;
  verticalVelocity: number;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const normalized = clamp01((value - edge0) / (edge1 - edge0));
  return normalized * normalized * (3 - 2 * normalized);
}

function hash21(x: number, y: number, seed: number): number {
  return fract(
    Math.sin(
      x * RIVER_SURFACE_MACRO_NOISE.hashDirection[0] +
        y * RIVER_SURFACE_MACRO_NOISE.hashDirection[1] +
        seed * RIVER_SURFACE_HASH_SEED_SCALE
    ) * RIVER_SURFACE_HASH_MULTIPLIER
  );
}

function valueNoise(x: number, y: number, seed: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const localX = fract(x);
  const localY = fract(y);
  const curveX = localX * localX * (3 - 2 * localX);
  const curveY = localY * localY * (3 - 2 * localY);
  const bottom = hash21(cellX, cellY, seed) * (1 - curveX) + hash21(cellX + 1, cellY, seed) * curveX;
  const top = hash21(cellX, cellY + 1, seed) * (1 - curveX) + hash21(cellX + 1, cellY + 1, seed) * curveX;
  return bottom * (1 - curveY) + top * curveY;
}

function fbm(x: number, y: number, seed: number): number {
  const tuning = RIVER_SURFACE_MACRO_NOISE;
  return (
    valueNoise(x, y, seed) * tuning.octaveWeights[0] +
    valueNoise(
      x * tuning.secondOctaveScale + tuning.secondOctaveOffset[0],
      y * tuning.secondOctaveScale + tuning.secondOctaveOffset[1],
      seed
    ) *
      tuning.octaveWeights[1] +
    valueNoise(
      x * tuning.thirdOctaveScale + tuning.thirdOctaveOffset[0],
      y * tuning.thirdOctaveScale + tuning.thirdOctaveOffset[1],
      seed
    ) *
      tuning.octaveWeights[2]
  );
}

function evaluateHeight(
  motion: RiverCompiledSurfaceMotionData,
  coordinates: RiverSurfaceMotionCoordinates,
  signedAcrossDistance: number,
  networkFlowTime: number,
  elapsedTime: number
): number {
  if (motion.maxDisplacement <= 0) return 0;
  const shoreDistance = coordinates.halfWidth - Math.abs(signedAcrossDistance);
  const shoreDamping = smoothstep(0, motion.shoreDampingWidth, shoreDistance);
  if (shoreDamping <= 0) return 0;
  const activeTime = coordinates.flowSpeed > RIVER_SURFACE_FLOW_EPSILON ? elapsedTime : 0;
  const inverseLengthScale = 1 / motion.displacementLengthScale;
  const baseX = signedAcrossDistance * inverseLengthScale;
  const baseY = (networkFlowTime - activeTime) * RIVER_SURFACE_REFERENCE_FLOW_SPEED * inverseLengthScale;
  const warpX =
    valueNoise(
      baseX * RIVER_SURFACE_DOMAIN_WARP_SCALE + RIVER_SURFACE_MACRO_NOISE.warpOffsetX[0],
      baseY * RIVER_SURFACE_DOMAIN_WARP_SCALE + RIVER_SURFACE_MACRO_NOISE.warpOffsetX[1],
      motion.seed
    ) *
      2 -
    1;
  const warpY =
    valueNoise(
      baseX * RIVER_SURFACE_DOMAIN_WARP_SCALE + RIVER_SURFACE_MACRO_NOISE.warpOffsetY[0],
      baseY * RIVER_SURFACE_DOMAIN_WARP_SCALE + RIVER_SURFACE_MACRO_NOISE.warpOffsetY[1],
      motion.seed
    ) *
      2 -
    1;
  const warpStrength = RIVER_SURFACE_DOMAIN_WARP_STRENGTH * motion.turbulence;
  const warpedX = baseX + warpX * warpStrength;
  const warpedY = baseY + warpY * warpStrength;
  const broad = fbm(warpedX, warpedY, motion.seed);
  const ridgeNoise = valueNoise(
    warpedX * RIVER_SURFACE_MACRO_NOISE.ridgeScale + RIVER_SURFACE_MACRO_NOISE.ridgeOffset[0],
    warpedY * RIVER_SURFACE_MACRO_NOISE.ridgeScale + RIVER_SURFACE_MACRO_NOISE.ridgeOffset[1],
    motion.seed
  );
  const ridge = 1 - Math.abs(ridgeNoise * 2 - 1);
  const shape =
    (broad - 0.5) * RIVER_SURFACE_MACRO_NOISE.broadWeight +
    (ridge - 0.5) * RIVER_SURFACE_MACRO_NOISE.ridgeWeight * motion.turbulence;
  return motion.maxDisplacement * shoreDamping * shape;
}

export function createRiverSurfaceMotionSampleOutput(): RiverSurfaceMotionSampleOutput {
  return { height: 0, acrossDerivative: 0, downstreamDerivative: 0, verticalVelocity: 0 };
}

export function evaluateRiverSurfaceMotion(
  motion: RiverCompiledSurfaceMotionData,
  coordinates: RiverSurfaceMotionCoordinates,
  elapsedTime: number,
  out: RiverSurfaceMotionSampleOutput
): RiverSurfaceMotionSampleOutput {
  const acrossStep = RIVER_SURFACE_DERIVATIVE_STEP;
  const flowTimeStep = acrossStep / Math.max(coordinates.flowSpeed, RIVER_SURFACE_FLOW_EPSILON);
  out.height = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime,
    elapsedTime
  );
  const acrossPositive = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance + acrossStep,
    coordinates.networkFlowTime,
    elapsedTime
  );
  const acrossNegative = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance - acrossStep,
    coordinates.networkFlowTime,
    elapsedTime
  );
  out.acrossDerivative = (acrossPositive - acrossNegative) / (acrossStep * 2);
  const downstreamPositive = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime + flowTimeStep,
    elapsedTime
  );
  const downstreamNegative = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime - flowTimeStep,
    elapsedTime
  );
  out.downstreamDerivative = (downstreamPositive - downstreamNegative) / (acrossStep * 2);
  const timeStep = RIVER_SURFACE_TIME_DERIVATIVE_STEP;
  const timePositive = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime,
    elapsedTime + timeStep
  );
  const timeNegative = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime,
    elapsedTime - timeStep
  );
  out.verticalVelocity = (timePositive - timeNegative) / (timeStep * 2);
  return out;
}

function deriveSeed(sourceId: string, preset: string): number {
  return Number.parseInt(hashRiverString(`${sourceId}:${preset}`).slice(-8), 16) & 0xffff;
}

export function resolveRiverSurfaceMotion(descriptor: RiverNetworkDescriptor): RiverCompiledSurfaceMotionData {
  if (descriptor.schemaVersion === RiverNetworkSchemaVersion.V2) {
    const authored = descriptor.defaults.surfaceMotion;
    return Object.freeze({
      seed: authored.seed,
      maxDisplacement: authored.displacementAmplitude,
      displacementLengthScale: authored.displacementLengthScale,
      shoreDampingWidth: authored.shoreDampingWidth,
      turbulence: authored.turbulence,
      crestIntensity: authored.crestIntensity,
      microNormalStrength: authored.microNormalStrength
    });
  }
  const style = RIVER_SURFACE_MOTION_STYLE_PRESET[descriptor.defaults.material.preset];
  const quality = RIVER_SURFACE_MOTION_QUALITY_SCALE[descriptor.defaults.quality.material.level];
  return Object.freeze({
    seed: deriveSeed(descriptor.id, descriptor.defaults.material.preset),
    maxDisplacement: style.displacementAmplitude * quality.displacement,
    displacementLengthScale: style.displacementLengthScale,
    shoreDampingWidth: style.shoreDampingWidth,
    turbulence: style.turbulence * quality.turbulence,
    crestIntensity: style.crestIntensity * quality.crest,
    microNormalStrength: style.microNormalStrength * quality.microNormal
  });
}
