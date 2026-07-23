/** Final visible-surface queries for the finite Ocean preview grid. */
import { Vector3 } from "@galacean/engine-math";
import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { createGerstnerInverseQueryResult, solveGerstnerSurfaceAtWorldXZ } from "../query/GerstnerInverseSurfaceQuery";
import {
  createWaterSurfaceQueryStatus,
  createWaterSurfaceSample,
  resetWaterSurfaceQueryStatus,
  resetWaterSurfaceSample,
  WaterSurfaceQueryFallback,
  type BatchWaterSurfaceProvider,
  type WaterSurfaceBatchOutput,
  type WaterSurfaceQueryStatus,
  type WaterSurfaceSample
} from "../query/WaterSurfaceProvider";
import { createWaterWaveSampleOutput } from "../wave/GerstnerWaveEvaluator";

export interface OceanWaterSurfaceProviderConfig {
  readonly waterBodyId: string;
  readonly waveSet: CompiledWaterWaveSet;
  readonly size: number;
  readonly waterLevel: number;
  readonly timeScale: number;
  readonly getElapsedTime: () => number;
  readonly accuracy?: WaterQueryAccuracy;
  /** Camera-relative ring geometry represents an unbounded ocean domain. */
  readonly unbounded?: boolean;
  /** The preview has no compiled bed; infinity states that assumption explicitly. */
  readonly waterDepth?: number;
}

export class OceanWaterSurfaceProvider implements BatchWaterSurfaceProvider {
  private readonly _waveSample = createWaterWaveSampleOutput();
  private readonly _inverse = createGerstnerInverseQueryResult();
  private readonly _status = createWaterSurfaceQueryStatus();
  private readonly _batchPosition = new Vector3();
  private readonly _batchSample = createWaterSurfaceSample();
  private _waterBodyId: string;
  private _waveSet: CompiledWaterWaveSet;
  private _halfSize: number;
  private _waterLevel: number;
  private _timeScale: number;
  private _getElapsedTime: () => number;
  private _accuracy: WaterQueryAccuracy;
  private _waterDepth: number;
  private _unbounded: boolean;

  constructor(config: OceanWaterSurfaceProviderConfig) {
    this._waterBodyId = config.waterBodyId;
    this._waveSet = config.waveSet;
    this._halfSize = Math.max(0, config.size * 0.5);
    this._waterLevel = config.waterLevel;
    this._timeScale = config.timeScale;
    this._getElapsedTime = config.getElapsedTime;
    this._accuracy = config.accuracy ?? WaterQueryAccuracy.Precise;
    this._waterDepth = config.waterDepth ?? Number.POSITIVE_INFINITY;
    this._unbounded = config.unbounded ?? false;
  }

  get lastQueryStatus(): Readonly<WaterSurfaceQueryStatus> {
    return this._status;
  }

  get horizontalExtent(): number {
    return this._unbounded ? Number.POSITIVE_INFINITY : this._halfSize + this._waveSet.maxHorizontalDisplacement;
  }

  setConfig(config: Omit<OceanWaterSurfaceProviderConfig, "getElapsedTime">): void {
    this._waterBodyId = config.waterBodyId;
    this._waveSet = config.waveSet;
    this._halfSize = Math.max(0, config.size * 0.5);
    this._waterLevel = config.waterLevel;
    this._timeScale = config.timeScale;
    this._accuracy = config.accuracy ?? WaterQueryAccuracy.Precise;
    this._waterDepth = config.waterDepth ?? Number.POSITIVE_INFINITY;
    this._unbounded = config.unbounded ?? false;
  }

  setElapsedTimeSource(getElapsedTime: () => number): void {
    this._getElapsedTime = getElapsedTime;
  }

  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
    return this.sampleSurfaceWithStatus(worldPosition, outSample, this._status);
  }

  sampleSurfaceWithStatus(
    worldPosition: Vector3,
    outSample: WaterSurfaceSample,
    outStatus: WaterSurfaceQueryStatus
  ): boolean {
    resetWaterSurfaceSample(outSample);
    const converged = solveGerstnerSurfaceAtWorldXZ(
      this._waveSet,
      worldPosition.x,
      this._waterLevel,
      worldPosition.z,
      Math.max(0, this._getElapsedTime()),
      this._timeScale,
      this._accuracy,
      this._waveSample,
      this._inverse,
      outStatus
    );
    if (!converged) return false;
    if (
      !this._unbounded &&
      (this._inverse.restX < -this._halfSize ||
        this._inverse.restX > this._halfSize ||
        this._inverse.restZ < -this._halfSize ||
        this._inverse.restZ > this._halfSize)
    ) {
      resetWaterSurfaceQueryStatus(outStatus);
      outStatus.converged = true;
      outStatus.capabilityFallback = WaterSurfaceQueryFallback.OutsideFootprint;
      return false;
    }

    const wave = this._waveSample;
    outSample.waterBodyId = this._waterBodyId;
    outSample.surfacePosition.set(worldPosition.x, wave.displacedY, worldPosition.z);
    outSample.surfaceNormal.set(wave.normalX, wave.normalY, wave.normalZ);
    outSample.waterVelocity.set(wave.horizontalVelocityX, wave.verticalVelocity, wave.horizontalVelocityZ);
    outSample.waterDepth = this._waterDepth;
    outStatus.hit = true;
    return true;
  }

  sampleSurfaceBatch(positions: Float32Array, out: WaterSurfaceBatchOutput): number {
    const count = Math.floor(positions.length / 3);
    this._assertBatchCapacity(out, count);
    for (let index = 0; index < count; index++) {
      const offset = index * 3;
      this._batchPosition.set(positions[offset], positions[offset + 1], positions[offset + 2]);
      const hit = this.sampleSurfaceWithStatus(this._batchPosition, this._batchSample, this._status);
      const sample = this._batchSample;
      out.hits[index] = hit ? 1 : 0;
      out.converged[index] = this._status.converged ? 1 : 0;
      out.iterations[index] = this._status.iterations;
      out.capabilityFallbacks[index] = this._status.capabilityFallback;
      out.horizontalErrors[index] = this._status.horizontalError;
      out.surfacePositions[offset] = sample.surfacePosition.x;
      out.surfacePositions[offset + 1] = sample.surfacePosition.y;
      out.surfacePositions[offset + 2] = sample.surfacePosition.z;
      out.surfaceNormals[offset] = sample.surfaceNormal.x;
      out.surfaceNormals[offset + 1] = sample.surfaceNormal.y;
      out.surfaceNormals[offset + 2] = sample.surfaceNormal.z;
      out.waterVelocities[offset] = sample.waterVelocity.x;
      out.waterVelocities[offset + 1] = sample.waterVelocity.y;
      out.waterVelocities[offset + 2] = sample.waterVelocity.z;
      out.waterDepths[index] = sample.waterDepth;
      out.waterBodyIds[index] = sample.waterBodyId;
    }
    return count;
  }

  private _assertBatchCapacity(out: WaterSurfaceBatchOutput, count: number): void {
    if (
      out.hits.length < count ||
      out.converged.length < count ||
      out.iterations.length < count ||
      out.capabilityFallbacks.length < count ||
      out.horizontalErrors.length < count ||
      out.surfacePositions.length < count * 3 ||
      out.surfaceNormals.length < count * 3 ||
      out.waterVelocities.length < count * 3 ||
      out.waterDepths.length < count ||
      out.waterBodyIds.length < count
    ) {
      throw new RangeError("Ocean water batch output capacity is smaller than the position count.");
    }
  }
}
