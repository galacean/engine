/** Allocation-free Newton solve from visible world XZ back to Gerstner rest XZ. */
import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { evaluateGerstnerWaveSet } from "../wave/GerstnerWaveEvaluator";
import type { WaterWaveSampleOutput } from "../wave/WaterWaveRuntimeTypes";
import {
  resetWaterSurfaceQueryStatus,
  WaterSurfaceQueryFallback,
  type WaterSurfaceQueryStatus
} from "./WaterSurfaceProvider";

const ITERATION_LIMIT: Readonly<Record<WaterQueryAccuracy, number>> = {
  [WaterQueryAccuracy.Fast]: 4,
  [WaterQueryAccuracy.Precise]: 8
};

const ERROR_TOLERANCE: Readonly<Record<WaterQueryAccuracy, number>> = {
  [WaterQueryAccuracy.Fast]: 0.002,
  [WaterQueryAccuracy.Precise]: 0.00001
};

const MINIMUM_JACOBIAN_DETERMINANT = 1e-8;

export interface GerstnerInverseQueryResult {
  restX: number;
  restZ: number;
}

export function createGerstnerInverseQueryResult(): GerstnerInverseQueryResult {
  return { restX: 0, restZ: 0 };
}

/**
 * Solves the horizontal Gerstner displacement and leaves `outWave` evaluated at
 * the final rest coordinate. A false result is an explicit non-convergence,
 * never a silent flat-surface fallback.
 */
export function solveGerstnerSurfaceAtWorldXZ(
  waveSet: CompiledWaterWaveSet,
  worldX: number,
  restY: number,
  worldZ: number,
  elapsedTime: number,
  timeScale: number,
  accuracy: WaterQueryAccuracy,
  outWave: WaterWaveSampleOutput,
  outInverse: GerstnerInverseQueryResult,
  outStatus: WaterSurfaceQueryStatus
): boolean {
  resetWaterSurfaceQueryStatus(outStatus);
  outInverse.restX = Number.isFinite(worldX) ? worldX : 0;
  outInverse.restZ = Number.isFinite(worldZ) ? worldZ : 0;
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
    outStatus.capabilityFallback = WaterSurfaceQueryFallback.NonConverged;
    return false;
  }

  const iterationLimit = ITERATION_LIMIT[accuracy];
  const tolerance = ERROR_TOLERANCE[accuracy];
  const maximumCorrection = Math.max(0.25, waveSet.maxHorizontalDisplacement * 2);
  for (let iteration = 0; iteration < iterationLimit; iteration++) {
    evaluateGerstnerWaveSet(
      waveSet,
      outInverse.restX,
      restY,
      outInverse.restZ,
      elapsedTime,
      timeScale,
      accuracy,
      outWave
    );
    const errorX = outWave.displacedX - worldX;
    const errorZ = outWave.displacedZ - worldZ;
    const horizontalError = Math.hypot(errorX, errorZ);
    outStatus.iterations = iteration + 1;
    outStatus.horizontalError = horizontalError;
    if (horizontalError <= tolerance) {
      outStatus.hit = true;
      outStatus.converged = true;
      return true;
    }

    const determinant = outWave.derivativeXX * outWave.derivativeZZ - outWave.derivativeXZ * outWave.derivativeZX;
    if (!Number.isFinite(determinant) || Math.abs(determinant) <= MINIMUM_JACOBIAN_DETERMINANT) break;
    let correctionX = (outWave.derivativeZZ * errorX - outWave.derivativeXZ * errorZ) / determinant;
    let correctionZ = (-outWave.derivativeZX * errorX + outWave.derivativeXX * errorZ) / determinant;
    const correctionLength = Math.hypot(correctionX, correctionZ);
    if (!Number.isFinite(correctionLength)) break;
    if (correctionLength > maximumCorrection) {
      const scale = maximumCorrection / correctionLength;
      correctionX *= scale;
      correctionZ *= scale;
    }
    outInverse.restX -= correctionX;
    outInverse.restZ -= correctionZ;
  }

  evaluateGerstnerWaveSet(
    waveSet,
    outInverse.restX,
    restY,
    outInverse.restZ,
    elapsedTime,
    timeScale,
    accuracy,
    outWave
  );
  outStatus.horizontalError = Math.hypot(outWave.displacedX - worldX, outWave.displacedZ - worldZ);
  outStatus.capabilityFallback = WaterSurfaceQueryFallback.NonConverged;
  return false;
}
