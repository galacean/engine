import {
  WATER_WAVE_EPSILON,
  WATER_WAVE_FAST_ACTIVE_COUNT,
  WATER_WAVE_TWO_PI
} from "../../authoring/wave/constants/WaterWaveLimits";
import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type {
  CompiledGerstnerWave,
  CompiledWaterWaveSet
} from "../../compiler/wave/CompiledWaterWaveTypes";
import { evaluateGerstnerWaveSet } from "../wave/GerstnerWaveEvaluator";
import type { WaterWaveSampleOutput } from "../wave/WaterWaveRuntimeTypes";

export interface OceanNearshoreWaveFacts {
  readonly waterDepth: number;
  /** Signed metres; positive in water and negative on land. */
  readonly shoreDistance: number;
  /** Unit vector pointing from water toward dry land. */
  readonly shoreNormalX: number;
  readonly shoreNormalZ: number;
}

export interface OceanNearshoreWaveProfile {
  readonly shallowInfluenceDepth: number;
  readonly deepWaterDepth: number;
  readonly directionRefractionStrength: number;
  readonly minimumPhaseSpeedScale: number;
  readonly shoalingAmplitudeGain: number;
  readonly maximumSteepnessScale: number;
  readonly shoreDampingStart: number;
  readonly shoreDampingEnd: number;
  readonly breakerDepthStart: number;
  readonly breakerDepthEnd: number;
  readonly breakerShoreStart: number;
  readonly breakerShorePeak: number;
  readonly breakerShoreEnd: number;
}

export interface OceanNearshoreWaveModifier {
  influence: number;
  directionBlend: number;
  phaseSpeedScale: number;
  waveNumberScale: number;
  amplitudeScale: number;
  horizontalAmplitudeScale: number;
  shoreDamping: number;
  breakerTendency: number;
  shoreNormalX: number;
  shoreNormalZ: number;
}

export interface OceanNearshoreWaveDirection {
  x: number;
  z: number;
}

export interface OceanNearshoreWaveDerivatives {
  xx: number;
  xy: number;
  xz: number;
  zx: number;
  zy: number;
  zz: number;
}

export const DEFAULT_OCEAN_NEARSHORE_WAVE_PROFILE: Readonly<OceanNearshoreWaveProfile> =
  Object.freeze({
    shallowInfluenceDepth: 2.5,
    deepWaterDepth: 12,
    directionRefractionStrength: 0.58,
    minimumPhaseSpeedScale: 0.48,
    shoalingAmplitudeGain: 0.22,
    maximumSteepnessScale: 1.28,
    shoreDampingStart: 0.35,
    shoreDampingEnd: 4.5,
    breakerDepthStart: 1.1,
    breakerDepthEnd: 3.8,
    breakerShoreStart: 0.5,
    breakerShorePeak: 7,
    breakerShoreEnd: 34
  });

export function createOceanNearshoreWaveModifier(): OceanNearshoreWaveModifier {
  return {
    influence: 0,
    directionBlend: 0,
    phaseSpeedScale: 1,
    waveNumberScale: 1,
    amplitudeScale: 1,
    horizontalAmplitudeScale: 1,
    shoreDamping: 1,
    breakerTendency: 0,
    shoreNormalX: 0,
    shoreNormalZ: 0
  };
}

export function createOceanNearshoreWaveDirection(): OceanNearshoreWaveDirection {
  return { x: 1, z: 0 };
}

export function createOceanNearshoreWaveDerivatives(): OceanNearshoreWaveDerivatives {
  return { xx: 1, xy: 0, xz: 0, zx: 0, zy: 0, zz: 1 };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(minimum: number, maximum: number, value: number): number {
  const t = clamp01(
    (value - minimum) / Math.max(maximum - minimum, WATER_WAVE_EPSILON)
  );
  return t * t * (3 - 2 * t);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function resetWaveOutput(
  restX: number,
  restY: number,
  restZ: number,
  out: WaterWaveSampleOutput
): void {
  out.displacedX = Number.isFinite(restX) ? restX : 0;
  out.displacedY = Number.isFinite(restY) ? restY : 0;
  out.displacedZ = Number.isFinite(restZ) ? restZ : 0;
  out.normalX = 0;
  out.normalY = 1;
  out.normalZ = 0;
  out.horizontalVelocityX = 0;
  out.verticalVelocity = 0;
  out.horizontalVelocityZ = 0;
  out.derivativeXX = 1;
  out.derivativeXZ = 0;
  out.derivativeZX = 0;
  out.derivativeZZ = 1;
}

/**
 * Resolves bounded shallow-water modifiers. Infinite/deep water is an exact
 * identity so the existing Ocean remains byte-for-byte stable offshore.
 */
export function resolveOceanNearshoreWaveModifier(
  facts: Readonly<OceanNearshoreWaveFacts>,
  out: OceanNearshoreWaveModifier,
  profile: Readonly<OceanNearshoreWaveProfile> =
    DEFAULT_OCEAN_NEARSHORE_WAVE_PROFILE
): OceanNearshoreWaveModifier {
  const depth = Number.isFinite(facts.waterDepth)
    ? Math.max(0, facts.waterDepth)
    : Number.POSITIVE_INFINITY;
  const shoreDistance = Number.isFinite(facts.shoreDistance)
    ? facts.shoreDistance
    : profile.breakerShoreEnd;
  const influence = Number.isFinite(depth)
    ? 1 -
      smoothstep(
        profile.shallowInfluenceDepth,
        profile.deepWaterDepth,
        depth
      )
    : 0;
  const normalLength = Math.hypot(
    Number.isFinite(facts.shoreNormalX) ? facts.shoreNormalX : 0,
    Number.isFinite(facts.shoreNormalZ) ? facts.shoreNormalZ : 0
  );
  const hasShoreNormal = normalLength > WATER_WAVE_EPSILON;
  out.shoreNormalX = hasShoreNormal ? facts.shoreNormalX / normalLength : 0;
  out.shoreNormalZ = hasShoreNormal ? facts.shoreNormalZ / normalLength : 0;
  out.influence = influence;
  out.directionBlend = hasShoreNormal
    ? influence * profile.directionRefractionStrength
    : 0;
  out.phaseSpeedScale =
    1 - influence * (1 - profile.minimumPhaseSpeedScale);
  out.waveNumberScale = 1 / Math.max(
    out.phaseSpeedScale,
    WATER_WAVE_EPSILON
  );
  out.shoreDamping = smoothstep(
    profile.shoreDampingStart,
    profile.shoreDampingEnd,
    Math.max(0, shoreDistance)
  );
  const shoalingScale = 1 + profile.shoalingAmplitudeGain * influence;
  out.amplitudeScale =
    1 + influence * (shoalingScale * out.shoreDamping - 1);
  const breakerDepth =
    1 -
    smoothstep(
      profile.breakerDepthStart,
      profile.breakerDepthEnd,
      depth
    );
  const breakerShoreRise = smoothstep(
    profile.breakerShoreStart,
    profile.breakerShorePeak,
    shoreDistance
  );
  const breakerShoreFall =
    1 -
    smoothstep(
      profile.breakerShorePeak,
      profile.breakerShoreEnd,
      shoreDistance
    );
  out.breakerTendency =
    influence * breakerDepth * breakerShoreRise * breakerShoreFall;
  out.horizontalAmplitudeScale =
    out.amplitudeScale *
    (1 +
      out.breakerTendency * (profile.maximumSteepnessScale - 1));
  return out;
}

/**
 * Float32 reference for the GLSL probe contract. It intentionally rounds the
 * resolved result, matching uniform/varying precision without duplicating a
 * second set of tuning constants.
 */
export function resolveOceanNearshoreWaveModifierF32(
  facts: Readonly<OceanNearshoreWaveFacts>,
  out: OceanNearshoreWaveModifier,
  profile: Readonly<OceanNearshoreWaveProfile> =
    DEFAULT_OCEAN_NEARSHORE_WAVE_PROFILE
): OceanNearshoreWaveModifier {
  resolveOceanNearshoreWaveModifier(facts, out, profile);
  out.influence = Math.fround(out.influence);
  out.directionBlend = Math.fround(out.directionBlend);
  out.phaseSpeedScale = Math.fround(out.phaseSpeedScale);
  out.waveNumberScale = Math.fround(out.waveNumberScale);
  out.amplitudeScale = Math.fround(out.amplitudeScale);
  out.horizontalAmplitudeScale = Math.fround(
    out.horizontalAmplitudeScale
  );
  out.shoreDamping = Math.fround(out.shoreDamping);
  out.breakerTendency = Math.fround(out.breakerTendency);
  out.shoreNormalX = Math.fround(out.shoreNormalX);
  out.shoreNormalZ = Math.fround(out.shoreNormalZ);
  return out;
}

export function resolveOceanNearshoreWaveDirection(
  baseDirectionX: number,
  baseDirectionZ: number,
  modifier: Readonly<OceanNearshoreWaveModifier>,
  out: OceanNearshoreWaveDirection
): OceanNearshoreWaveDirection {
  const blendedX =
    baseDirectionX +
    (modifier.shoreNormalX - baseDirectionX) * modifier.directionBlend;
  const blendedZ =
    baseDirectionZ +
    (modifier.shoreNormalZ - baseDirectionZ) * modifier.directionBlend;
  const length = Math.hypot(blendedX, blendedZ);
  if (length > WATER_WAVE_EPSILON) {
    out.x = blendedX / length;
    out.z = blendedZ / length;
  } else {
    const baseLength = Math.hypot(baseDirectionX, baseDirectionZ);
    out.x =
      baseLength > WATER_WAVE_EPSILON ? baseDirectionX / baseLength : 1;
    out.z =
      baseLength > WATER_WAVE_EPSILON ? baseDirectionZ / baseLength : 0;
  }
  return out;
}

function applyNearshoreWave(
  wave: Readonly<CompiledGerstnerWave>,
  modifier: Readonly<OceanNearshoreWaveModifier>,
  direction: OceanNearshoreWaveDirection,
  restX: number,
  restZ: number,
  elapsedTime: number,
  timeScale: number,
  out: WaterWaveSampleOutput,
  derivatives: OceanNearshoreWaveDerivatives
): void {
  resolveOceanNearshoreWaveDirection(
    wave.directionX,
    wave.directionZ,
    modifier,
    direction
  );
  const waveNumber = wave.waveNumber * modifier.waveNumberScale;
  const angularRate =
    wave.angularFrequency * timeScale * modifier.phaseSpeedScale;
  const wavePeriod =
    WATER_WAVE_TWO_PI /
    Math.max(Math.abs(angularRate), WATER_WAVE_EPSILON);
  const wrappedTime = positiveModulo(elapsedTime, wavePeriod);
  const theta =
    waveNumber * (direction.x * restX + direction.z * restZ) -
    angularRate * wrappedTime +
    wave.phase;
  const sine = Math.sin(theta);
  const cosine = Math.cos(theta);
  const amplitude = wave.amplitude * modifier.amplitudeScale;
  const horizontalAmplitude =
    wave.horizontalAmplitude * modifier.horizontalAmplitudeScale;
  const horizontalCosine = horizontalAmplitude * cosine;
  const horizontalDerivative =
    horizontalAmplitude * waveNumber * sine;
  const verticalDerivative = amplitude * waveNumber * cosine;
  out.displacedX += direction.x * horizontalCosine;
  out.displacedY += amplitude * sine;
  out.displacedZ += direction.z * horizontalCosine;
  const horizontalVelocity = horizontalAmplitude * angularRate * sine;
  out.horizontalVelocityX += direction.x * horizontalVelocity;
  out.verticalVelocity -= amplitude * angularRate * cosine;
  out.horizontalVelocityZ += direction.z * horizontalVelocity;
  derivatives.xx -= horizontalDerivative * direction.x * direction.x;
  derivatives.xy += verticalDerivative * direction.x;
  derivatives.xz -= horizontalDerivative * direction.x * direction.z;
  derivatives.zx -= horizontalDerivative * direction.z * direction.x;
  derivatives.zy += verticalDerivative * direction.z;
  derivatives.zz -= horizontalDerivative * direction.z * direction.z;
}

/**
 * Allocation-free CPU counterpart of the Ocean vertex path at one rest-space
 * coordinate. The caller owns both result buffers.
 */
export function evaluateOceanNearshoreWaveSet(
  waveSet: CompiledWaterWaveSet,
  restX: number,
  restY: number,
  restZ: number,
  elapsedTime: number,
  timeScale: number,
  accuracy: WaterQueryAccuracy,
  facts: Readonly<OceanNearshoreWaveFacts>,
  outWave: WaterWaveSampleOutput,
  outModifier: OceanNearshoreWaveModifier,
  outDirection: OceanNearshoreWaveDirection,
  outDerivatives: OceanNearshoreWaveDerivatives,
  profile: Readonly<OceanNearshoreWaveProfile> =
    DEFAULT_OCEAN_NEARSHORE_WAVE_PROFILE
): WaterWaveSampleOutput {
  const safeRestX = Number.isFinite(restX) ? restX : 0;
  const safeRestY = Number.isFinite(restY) ? restY : 0;
  const safeRestZ = Number.isFinite(restZ) ? restZ : 0;
  const safeTime = Number.isFinite(elapsedTime) ? elapsedTime : 0;
  const safeTimeScale = Number.isFinite(timeScale) ? timeScale : 0;
  resetWaveOutput(safeRestX, safeRestY, safeRestZ, outWave);
  resolveOceanNearshoreWaveModifier(facts, outModifier, profile);
  if (outModifier.influence === 0) {
    return evaluateGerstnerWaveSet(
      waveSet,
      safeRestX,
      safeRestY,
      safeRestZ,
      safeTime,
      safeTimeScale,
      accuracy,
      outWave
    );
  }
  if (
    waveSet.model === WaterWaveModel.None ||
    waveSet.activeWaveCount === 0
  ) {
    return outWave;
  }

  const waveCount =
    accuracy === WaterQueryAccuracy.Fast
      ? Math.min(WATER_WAVE_FAST_ACTIVE_COUNT, waveSet.activeWaveCount)
      : waveSet.activeWaveCount;
  outDerivatives.xx = 1;
  outDerivatives.xy = 0;
  outDerivatives.xz = 0;
  outDerivatives.zx = 0;
  outDerivatives.zy = 0;
  outDerivatives.zz = 1;
  for (let index = 0; index < waveCount; index++) {
    applyNearshoreWave(
      waveSet.waves[index],
      outModifier,
      outDirection,
      safeRestX,
      safeRestZ,
      safeTime,
      safeTimeScale,
      outWave,
      outDerivatives
    );
  }
  outWave.derivativeXX = outDerivatives.xx;
  outWave.derivativeXZ = outDerivatives.xz;
  outWave.derivativeZX = outDerivatives.zx;
  outWave.derivativeZZ = outDerivatives.zz;
  const normalX =
    outDerivatives.zy * outDerivatives.xz -
    outDerivatives.zz * outDerivatives.xy;
  const normalY =
    outDerivatives.zz * outDerivatives.xx -
    outDerivatives.zx * outDerivatives.xz;
  const normalZ =
    outDerivatives.zx * outDerivatives.xy -
    outDerivatives.zy * outDerivatives.xx;
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  if (normalLength > WATER_WAVE_EPSILON) {
    outWave.normalX = normalX / normalLength;
    outWave.normalY = normalY / normalLength;
    outWave.normalZ = normalZ / normalLength;
  }
  return outWave;
}

function glsl(value: number): string {
  return value.toFixed(8);
}

/** Shared GLSL modifier function generated from the CPU profile constants. */
export function createOceanNearshoreWaveModifierGlsl(): string {
  const profile = DEFAULT_OCEAN_NEARSHORE_WAVE_PROFILE;
  return `      void resolveOceanNearshoreWaveModifier(
        float waterDepth,
        float shoreDistance,
        vec2 shoreNormal,
        out float influence,
        out float directionBlend,
        out float phaseSpeedScale,
        out float waveNumberScale,
        out float amplitudeScale,
        out float horizontalAmplitudeScale,
        out float shoreDamping,
        out float breakerTendency
      ) {
        influence = 1.0 - smoothstep(
          ${glsl(profile.shallowInfluenceDepth)},
          ${glsl(profile.deepWaterDepth)},
          max(waterDepth, 0.0)
        );
        directionBlend =
          influence * ${glsl(profile.directionRefractionStrength)}
          * step(${glsl(WATER_WAVE_EPSILON)}, length(shoreNormal));
        phaseSpeedScale =
          1.0 - influence * (1.0 - ${glsl(profile.minimumPhaseSpeedScale)});
        waveNumberScale = 1.0 / max(phaseSpeedScale, ${glsl(WATER_WAVE_EPSILON)});
        shoreDamping = smoothstep(
          ${glsl(profile.shoreDampingStart)},
          ${glsl(profile.shoreDampingEnd)},
          max(shoreDistance, 0.0)
        );
        float shoalingScale =
          1.0 + ${glsl(profile.shoalingAmplitudeGain)} * influence;
        amplitudeScale =
          1.0 + influence * (shoalingScale * shoreDamping - 1.0);
        float breakerDepth = 1.0 - smoothstep(
          ${glsl(profile.breakerDepthStart)},
          ${glsl(profile.breakerDepthEnd)},
          max(waterDepth, 0.0)
        );
        float breakerShoreRise = smoothstep(
          ${glsl(profile.breakerShoreStart)},
          ${glsl(profile.breakerShorePeak)},
          shoreDistance
        );
        float breakerShoreFall = 1.0 - smoothstep(
          ${glsl(profile.breakerShorePeak)},
          ${glsl(profile.breakerShoreEnd)},
          shoreDistance
        );
        breakerTendency =
          influence * breakerDepth * breakerShoreRise * breakerShoreFall;
        horizontalAmplitudeScale =
          amplitudeScale
          * (1.0 + breakerTendency * (${glsl(profile.maximumSteepnessScale)} - 1.0));
      }`;
}
