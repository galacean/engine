/** Allocation-free rest-space Gerstner evaluator for gameplay probes and parity checks. */
import { WATER_WAVE_EPSILON, WATER_WAVE_FAST_ACTIVE_COUNT } from "../../authoring/wave/constants/WaterWaveLimits";
import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { CompiledWaterWaveSet } from "../../compiler/wave/types/CompiledWaterWaveTypes";
import type { WaterWaveSampleOutput } from "./types/WaterWaveRuntimeTypes";

export function createWaterWaveSampleOutput(): WaterWaveSampleOutput {
  return {
    displacedX: 0,
    displacedY: 0,
    displacedZ: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0,
    verticalVelocity: 0
  };
}

/**
 * Evaluates the displaced surface at an undisplaced rest/local coordinate.
 * This is not a world-XZ inverse query; Gerstner horizontal displacement makes that a separate solve.
 */
export function evaluateGerstnerWaveSet(
  waveSet: CompiledWaterWaveSet,
  restX: number,
  restY: number,
  restZ: number,
  elapsedTime: number,
  timeScale: number,
  accuracy: WaterQueryAccuracy,
  out: WaterWaveSampleOutput
): WaterWaveSampleOutput {
  const safeRestX = Number.isFinite(restX) ? restX : 0;
  const safeRestY = Number.isFinite(restY) ? restY : 0;
  const safeRestZ = Number.isFinite(restZ) ? restZ : 0;
  const safeTime = Number.isFinite(elapsedTime) ? elapsedTime : 0;
  const safeTimeScale = Number.isFinite(timeScale) ? timeScale : 0;
  out.displacedX = safeRestX;
  out.displacedY = safeRestY;
  out.displacedZ = safeRestZ;
  out.normalX = 0;
  out.normalY = 1;
  out.normalZ = 0;
  out.verticalVelocity = 0;
  if (waveSet.model === WaterWaveModel.None || waveSet.activeWaveCount === 0) return out;

  const waveCount =
    accuracy === WaterQueryAccuracy.Fast
      ? Math.min(WATER_WAVE_FAST_ACTIVE_COUNT, waveSet.activeWaveCount)
      : waveSet.activeWaveCount;
  let derivativeXX = 1;
  let derivativeXY = 0;
  let derivativeXZ = 0;
  let derivativeZX = 0;
  let derivativeZY = 0;
  let derivativeZZ = 1;
  for (let index = 0; index < waveCount; index++) {
    const wave = waveSet.waves[index];
    const theta =
      wave.waveNumber * (wave.directionX * safeRestX + wave.directionZ * safeRestZ) -
      wave.angularFrequency * safeTime * safeTimeScale +
      wave.phase;
    const sine = Math.sin(theta);
    const cosine = Math.cos(theta);
    const horizontalCosine = wave.horizontalAmplitude * cosine;
    const horizontalDerivative = wave.horizontalAmplitude * wave.waveNumber * sine;
    const verticalDerivative = wave.amplitude * wave.waveNumber * cosine;
    out.displacedX += wave.directionX * horizontalCosine;
    out.displacedY += wave.amplitude * sine;
    out.displacedZ += wave.directionZ * horizontalCosine;
    out.verticalVelocity -= wave.amplitude * wave.angularFrequency * safeTimeScale * cosine;
    derivativeXX -= horizontalDerivative * wave.directionX * wave.directionX;
    derivativeXY += verticalDerivative * wave.directionX;
    derivativeXZ -= horizontalDerivative * wave.directionX * wave.directionZ;
    derivativeZX -= horizontalDerivative * wave.directionZ * wave.directionX;
    derivativeZY += verticalDerivative * wave.directionZ;
    derivativeZZ -= horizontalDerivative * wave.directionZ * wave.directionZ;
  }

  const normalX = derivativeZY * derivativeXZ - derivativeZZ * derivativeXY;
  const normalY = derivativeZZ * derivativeXX - derivativeZX * derivativeXZ;
  const normalZ = derivativeZX * derivativeXY - derivativeZY * derivativeXX;
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  if (normalLength <= WATER_WAVE_EPSILON) {
    out.normalX = 0;
    out.normalY = 1;
    out.normalZ = 0;
  } else {
    const inverseLength = 1 / normalLength;
    out.normalX = normalX * inverseLength;
    out.normalY = normalY * inverseLength;
    out.normalZ = normalZ * inverseLength;
  }
  return out;
}
