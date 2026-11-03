import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import {
  RIVER_SURFACE_DERIVATIVE_STEP,
  RIVER_SURFACE_DERIVATIVE_MIN_FLOW_SPEED,
  RIVER_SURFACE_DOMAIN_WARP_SCALE,
  RIVER_SURFACE_DOMAIN_WARP_STRENGTH,
  RIVER_SURFACE_FLOW_EPSILON,
  RIVER_SURFACE_HASH_MULTIPLIER,
  RIVER_SURFACE_HASH_INCREMENT,
  RIVER_SURFACE_HASH_OUTPUT_MULTIPLIER,
  RIVER_SURFACE_MACRO_NOISE,
  RIVER_SURFACE_NOISE_PERIOD,
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

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Each noise lookup has its own scale; reducing the common base before scaling is incorrect. */
export interface RiverSurfaceDomainOffsets {
  base: number;
  warp: number;
  octave2: number;
  octave3: number;
  ridge: number;
}

export function createRiverSurfaceDomainOffsets(): RiverSurfaceDomainOffsets {
  return { base: 0, warp: 0, octave2: 0, octave3: 0, ridge: 0 };
}

/** Pure float64 reduction into caller-owned storage, also used for runtime uniforms. */
export function computeRiverSurfaceDomainOffsets(
  elapsedTime: number,
  lengthScale: number,
  out: RiverSurfaceDomainOffsets
): RiverSurfaceDomainOffsets {
  if (!Number.isFinite(elapsedTime)) throw new RangeError("River surface time must be finite.");
  const d = (-elapsedTime * RIVER_SURFACE_REFERENCE_FLOW_SPEED) / lengthScale;
  out.base = positiveModulo(d, RIVER_SURFACE_NOISE_PERIOD);
  out.warp = positiveModulo(d * RIVER_SURFACE_DOMAIN_WARP_SCALE, RIVER_SURFACE_NOISE_PERIOD);
  out.octave2 = positiveModulo(d * RIVER_SURFACE_MACRO_NOISE.secondOctaveScale, RIVER_SURFACE_NOISE_PERIOD);
  out.octave3 = positiveModulo(d * RIVER_SURFACE_MACRO_NOISE.thirdOctaveScale, RIVER_SURFACE_NOISE_PERIOD);
  out.ridge = positiveModulo(d * RIVER_SURFACE_MACRO_NOISE.ridgeScale, RIVER_SURFACE_NOISE_PERIOD);
  return out;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const normalized = clamp01((value - edge0) / (edge1 - edge0));
  return normalized * normalized * (3 - 2 * normalized);
}

/** Integer lattice wrapping, row-major packing and seed XOR match riverHashCell bit for bit.
 * The permutation uses unsigned 32-bit wraparound; callers sample integral noise cells.
 */
export function hashRiverSurfaceCell(x: number, y: number, seed: number): number {
  const cellX = positiveModulo(Math.floor(x), RIVER_SURFACE_NOISE_PERIOD) >>> 0;
  const cellY = positiveModulo(Math.floor(y), RIVER_SURFACE_NOISE_PERIOD) >>> 0;
  const input = ((cellX + Math.imul(cellY, RIVER_SURFACE_NOISE_PERIOD)) ^ seed) >>> 0;
  const state = (Math.imul(input, RIVER_SURFACE_HASH_MULTIPLIER) + RIVER_SURFACE_HASH_INCREMENT) >>> 0;
  const word = Math.imul((state >>> ((state >>> 28) + 4)) ^ state, RIVER_SURFACE_HASH_OUTPUT_MULTIPLIER) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

function hash21(x: number, y: number, seed: number): number {
  // The top 24 bits and power-of-two divisor are exactly representable in float32.
  return (hashRiverSurfaceCell(x, y, seed) >>> 8) / 16777216;
}

function valueNoise(x: number, y: number, seed: number): number {
  x = positiveModulo(x, RIVER_SURFACE_NOISE_PERIOD);
  y = positiveModulo(y, RIVER_SURFACE_NOISE_PERIOD);
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

function fbm(x: number, y: number, seed: number, offsets: RiverSurfaceDomainOffsets): number {
  const tuning = RIVER_SURFACE_MACRO_NOISE;
  return (
    valueNoise(x, y + offsets.base, seed) * tuning.octaveWeights[0] +
    valueNoise(
      x * tuning.secondOctaveScale + tuning.secondOctaveOffset[0],
      y * tuning.secondOctaveScale + tuning.secondOctaveOffset[1] + offsets.octave2,
      seed
    ) *
      tuning.octaveWeights[1] +
    valueNoise(
      x * tuning.thirdOctaveScale + tuning.thirdOctaveOffset[0],
      y * tuning.thirdOctaveScale + tuning.thirdOctaveOffset[1] + offsets.octave3,
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
  offsets: RiverSurfaceDomainOffsets
): number {
  if (motion.maxDisplacement <= 0) return 0;
  const shoreDistance = coordinates.halfWidth - Math.abs(signedAcrossDistance);
  const shoreDamping = smoothstep(0, motion.shoreDampingWidth, shoreDistance);
  if (shoreDamping <= 0) return 0;
  const inverseLengthScale = 1 / motion.displacementLengthScale;
  const baseX = signedAcrossDistance * inverseLengthScale;
  const baseY = networkFlowTime * RIVER_SURFACE_REFERENCE_FLOW_SPEED * inverseLengthScale;
  const warpX =
    valueNoise(
      baseX * RIVER_SURFACE_DOMAIN_WARP_SCALE + RIVER_SURFACE_MACRO_NOISE.warpOffsetX[0],
      baseY * RIVER_SURFACE_DOMAIN_WARP_SCALE + RIVER_SURFACE_MACRO_NOISE.warpOffsetX[1] + offsets.warp,
      motion.seed
    ) *
      2 -
    1;
  const warpY =
    valueNoise(
      baseX * RIVER_SURFACE_DOMAIN_WARP_SCALE + RIVER_SURFACE_MACRO_NOISE.warpOffsetY[0],
      baseY * RIVER_SURFACE_DOMAIN_WARP_SCALE + RIVER_SURFACE_MACRO_NOISE.warpOffsetY[1] + offsets.warp,
      motion.seed
    ) *
      2 -
    1;
  const warpStrength = RIVER_SURFACE_DOMAIN_WARP_STRENGTH * motion.turbulence;
  const warpedX = baseX + warpX * warpStrength;
  const warpedY = baseY + warpY * warpStrength;
  const broad = fbm(warpedX, warpedY, motion.seed, offsets);
  const ridgeNoise = valueNoise(
    warpedX * RIVER_SURFACE_MACRO_NOISE.ridgeScale + RIVER_SURFACE_MACRO_NOISE.ridgeOffset[0],
    warpedY * RIVER_SURFACE_MACRO_NOISE.ridgeScale + RIVER_SURFACE_MACRO_NOISE.ridgeOffset[1] + offsets.ridge,
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
  out: RiverSurfaceMotionSampleOutput,
  offsets: RiverSurfaceDomainOffsets = createRiverSurfaceDomainOffsets()
): RiverSurfaceMotionSampleOutput {
  if (!Number.isFinite(elapsedTime)) throw new RangeError("River surface time must be finite.");
  if (motion.maxDisplacement <= 0) {
    out.height = 0;
    out.acrossDerivative = 0;
    out.downstreamDerivative = 0;
    out.verticalVelocity = 0;
    return out;
  }
  const flowing = coordinates.flowSpeed > RIVER_SURFACE_FLOW_EPSILON;
  computeRiverSurfaceDomainOffsets(flowing ? elapsedTime : 0, motion.displacementLengthScale, offsets);
  const acrossStep = RIVER_SURFACE_DERIVATIVE_STEP;
  const sampledFlowSpeed = Math.max(coordinates.flowSpeed, RIVER_SURFACE_DERIVATIVE_MIN_FLOW_SPEED);
  const flowTimeStep = acrossStep / sampledFlowSpeed;
  const downstreamSpan = flowTimeStep * sampledFlowSpeed;
  out.height = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime,
    offsets
  );
  const acrossPositive = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance + acrossStep,
    coordinates.networkFlowTime,
    offsets
  );
  const acrossNegative = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance - acrossStep,
    coordinates.networkFlowTime,
    offsets
  );
  out.acrossDerivative = (acrossPositive - acrossNegative) / (acrossStep * 2);
  const downstreamPositive = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime + flowTimeStep,
    offsets
  );
  const downstreamNegative = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime - flowTimeStep,
    offsets
  );
  out.downstreamDerivative = (downstreamPositive - downstreamNegative) / (downstreamSpan * 2);
  const timeStep = RIVER_SURFACE_TIME_DERIVATIVE_STEP;
  computeRiverSurfaceDomainOffsets(flowing ? elapsedTime + timeStep : 0, motion.displacementLengthScale, offsets);
  const timePositive = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime,
    offsets
  );
  computeRiverSurfaceDomainOffsets(flowing ? elapsedTime - timeStep : 0, motion.displacementLengthScale, offsets);
  const timeNegative = evaluateHeight(
    motion,
    coordinates,
    coordinates.signedAcrossDistance,
    coordinates.networkFlowTime,
    offsets
  );
  out.verticalVelocity = (timePositive - timeNegative) / (timeStep * 2);
  return out;
}

export function resolveRiverSurfaceMotion(descriptor: RiverNetworkDescriptor): RiverCompiledSurfaceMotionData {
  const authored = descriptor.defaults.surfaceMotion;
  return Object.freeze({
    seed: authored.seed,
    maxDisplacement: authored.displacementAmplitude,
    displacementLengthScale: authored.displacementLengthScale,
    shoreDampingWidth: authored.shoreDampingWidth,
    turbulence: authored.turbulence
  });
}
