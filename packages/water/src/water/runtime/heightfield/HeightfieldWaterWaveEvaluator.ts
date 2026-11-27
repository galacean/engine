/** CPU mirror of the heightfield shader's visible macro-wave displacement. */
import { WATER_WAVE_EPSILON, WATER_WAVE_TWO_PI } from "../../authoring/wave/constants/WaterWaveLimits";
import type { HeightfieldWaterSurfaceMotionConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { HEIGHTFIELD_WATER_SURFACE_TUNING, HEIGHTFIELD_WATER_WAVE_TIME_SCALE } from "./constants";
import type { HeightfieldWaterBaseQueryResult } from "./types";

export interface HeightfieldWaterWaveSample {
  displacedX: number;
  displacedY: number;
  displacedZ: number;
  normalX: number;
  normalY: number;
  normalZ: number;
  displacementVelocityX: number;
  displacementVelocityY: number;
  displacementVelocityZ: number;
  waveOffset: number;
}

export function createHeightfieldWaterWaveSample(): HeightfieldWaterWaveSample {
  return {
    displacedX: 0,
    displacedY: 0,
    displacedZ: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    displacementVelocityX: 0,
    displacementVelocityY: 0,
    displacementVelocityZ: 0,
    waveOffset: 0
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const ratio = clamp01((value - edge0) / Math.max(edge1 - edge0, WATER_WAVE_EPSILON));
  return ratio * ratio * (3 - 2 * ratio);
}

/** A spatially uniform rate avoids the unbounded t * gradient(rate) phase gradient. */
export function heightfieldWaterWaveAngularRate(angularFrequency: number): number {
  return angularFrequency * HEIGHTFIELD_WATER_WAVE_TIME_SCALE * 0.82;
}

/** Shared float64 phase reduction for CPU queries and the runtime WaveB.y upload. */
export function heightfieldWaterWaveCycle(angularFrequency: number, elapsedTime: number): number {
  const safeTime = Number.isFinite(elapsedTime) ? Math.max(0, elapsedTime) : 0;
  const cycles = (safeTime * heightfieldWaterWaveAngularRate(angularFrequency)) / WATER_WAVE_TWO_PI;
  return ((cycles % 1) + 1) % 1;
}

/** Mutates `out` without retaining caller-owned base-query storage. */
export function evaluateHeightfieldWaterWaves(
  waveSet: CompiledWaterWaveSet,
  base: HeightfieldWaterBaseQueryResult,
  restX: number,
  restZ: number,
  elapsedTime: number,
  material: HeightfieldWaterSurfaceMotionConfig,
  wavesEnabled: boolean,
  out: HeightfieldWaterWaveSample
): HeightfieldWaterWaveSample {
  const normalX = base.surfaceNormal[0];
  const normalY = base.surfaceNormal[1];
  const normalZ = base.surfaceNormal[2];
  const tangentLength = Math.hypot(normalY, normalX) || 1;
  const tangentX = normalY / tangentLength;
  const tangentY = -normalX / tangentLength;
  const tangentZ = 0;
  const bitangentX = -normalZ * tangentY;
  const bitangentY = normalZ * tangentX;
  const bitangentZ = normalX * tangentY - normalY * tangentX;
  const flowX = base.flowVectorXZ[0];
  const flowZ = base.flowVectorXZ[1];
  const flowSpeed = Math.hypot(flowX, flowZ);
  const fallbackFlowX = -0.36;
  const fallbackFlowZ = -0.9329523;
  const inverseFlowLength = flowSpeed > WATER_WAVE_EPSILON ? 1 / flowSpeed : 0;
  const flowDirectionX = flowSpeed > WATER_WAVE_EPSILON ? flowX * inverseFlowLength : fallbackFlowX;
  const flowDirectionZ = flowSpeed > WATER_WAVE_EPSILON ? flowZ * inverseFlowLength : fallbackFlowZ;
  const tuning = HEIGHTFIELD_WATER_SURFACE_TUNING;
  const flowWeight = smoothstep(tuning.minimumFlowSpeed, tuning.maximumFlowSpeed * 0.42, flowSpeed);
  const macroFlowAlignment = flowWeight * tuning.macroFlowAlignment;
  const macroAmplitudeScale = tuning.stillMacroAmplitudeScale + (1 - tuning.stillMacroAmplitudeScale) * flowWeight;
  const shoreDamping = smoothstep(
    0,
    Math.max(material.shoreDampingWidth, WATER_WAVE_EPSILON),
    base.signedShoreDistance
  );
  let waveOffset = 0;
  let offsetVelocity = 0;
  let tangentSlope = 0;
  let bitangentSlope = 0;

  if (wavesEnabled) {
    for (let index = 0; index < waveSet.activeWaveCount; index++) {
      const wave = waveSet.waves[index];
      const authoredLength = Math.hypot(wave.directionX, wave.directionZ) || 1;
      const authoredX = wave.directionX / authoredLength;
      const authoredZ = wave.directionZ / authoredLength;
      let directionX = authoredX + (flowDirectionX - authoredX) * macroFlowAlignment;
      let directionZ = authoredZ + (flowDirectionZ - authoredZ) * macroFlowAlignment;
      const directionLength = Math.hypot(directionX, directionZ) || 1;
      directionX /= directionLength;
      directionZ /= directionLength;
      const angularRate = heightfieldWaterWaveAngularRate(wave.angularFrequency);
      const theta =
        wave.waveNumber * (directionX * restX + directionZ * restZ) -
        WATER_WAVE_TWO_PI * heightfieldWaterWaveCycle(wave.angularFrequency, elapsedTime) +
        wave.phase;
      const amplitude = wave.amplitude * material.waveStrength * macroAmplitudeScale;
      const sine = Math.sin(theta);
      const cosine = Math.cos(theta);
      const slope = amplitude * wave.waveNumber * cosine * shoreDamping;
      waveOffset += amplitude * sine * shoreDamping;
      offsetVelocity -= amplitude * angularRate * cosine * shoreDamping;
      tangentSlope += slope * (directionX * tangentX + directionZ * tangentZ);
      bitangentSlope += slope * (directionX * bitangentX + directionZ * bitangentZ);
    }
  }

  let macroNormalX = normalX - tangentX * tangentSlope - bitangentX * bitangentSlope;
  let macroNormalY = normalY - tangentY * tangentSlope - bitangentY * bitangentSlope;
  let macroNormalZ = normalZ - tangentZ * tangentSlope - bitangentZ * bitangentSlope;
  const macroNormalLength = Math.hypot(macroNormalX, macroNormalY, macroNormalZ) || 1;
  macroNormalX /= macroNormalLength;
  macroNormalY /= macroNormalLength;
  macroNormalZ /= macroNormalLength;
  out.displacedX = restX + normalX * waveOffset;
  out.displacedY = base.surfaceHeight + normalY * waveOffset;
  out.displacedZ = restZ + normalZ * waveOffset;
  out.normalX = macroNormalX;
  out.normalY = macroNormalY;
  out.normalZ = macroNormalZ;
  out.displacementVelocityX = normalX * offsetVelocity;
  out.displacementVelocityY = normalY * offsetVelocity;
  out.displacementVelocityZ = normalZ * offsetVelocity;
  out.waveOffset = waveOffset;
  return out;
}
