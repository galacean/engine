/** Final visible-surface provider over compiled heightfield water. */
import { Vector3 } from "@galacean/engine-math";
import type { HeightfieldWaterMaterialConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { HeightfieldWaterCompiledData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
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
import {
  createHeightfieldWaterBaseQueryResult,
  HeightfieldWaterBaseQueryService
} from "./HeightfieldWaterQueryService";
import { createHeightfieldWaterWaveSample, evaluateHeightfieldWaterWaves } from "./HeightfieldWaterWaveEvaluator";

const INVERSE_ITERATION_LIMIT = 8;
const INVERSE_ERROR_TOLERANCE = 0.0002;

export interface HeightfieldWaterSurfaceProviderConfig {
  readonly waterBodyId: string;
  readonly data: HeightfieldWaterCompiledData;
  readonly queryService: HeightfieldWaterBaseQueryService;
  readonly getElapsedTime: () => number;
  readonly wavesEnabled?: boolean;
}

export class HeightfieldWaterSurfaceProvider implements BatchWaterSurfaceProvider {
  private readonly _baseSample = createHeightfieldWaterBaseQueryResult();
  private readonly _waveSample = createHeightfieldWaterWaveSample();
  private readonly _status = createWaterSurfaceQueryStatus();
  private readonly _batchPosition = new Vector3();
  private readonly _batchSample = createWaterSurfaceSample();
  private _material: HeightfieldWaterMaterialConfig;
  private _wavesEnabled: boolean;
  private _surfaceTimeOverride?: number;

  constructor(private readonly _config: HeightfieldWaterSurfaceProviderConfig) {
    this._material = _config.data.material;
    this._wavesEnabled = _config.wavesEnabled ?? true;
  }

  get lastQueryStatus(): Readonly<WaterSurfaceQueryStatus> {
    return this._status;
  }

  setMaterial(config: HeightfieldWaterMaterialConfig): void {
    this._material = config;
  }

  setWavesEnabled(enabled: boolean): void {
    this._wavesEnabled = enabled;
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._surfaceTimeOverride = elapsedTime;
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
    resetWaterSurfaceQueryStatus(outStatus);
    if (!Number.isFinite(worldPosition.x) || !Number.isFinite(worldPosition.z)) {
      outStatus.capabilityFallback = WaterSurfaceQueryFallback.NonConverged;
      return false;
    }
    const elapsedTime = this._surfaceTimeOverride ?? this._config.getElapsedTime();
    let restX = worldPosition.x;
    let restZ = worldPosition.z;
    for (let iteration = 0; iteration < INVERSE_ITERATION_LIMIT; iteration++) {
      const base = this._config.queryService.sampleBaseSurface(restX, restZ, this._baseSample);
      if (!base.inside) {
        outStatus.capabilityFallback = WaterSurfaceQueryFallback.OutsideFootprint;
        return false;
      }
      const wave = evaluateHeightfieldWaterWaves(
        this._config.data.waveSet,
        base,
        restX,
        restZ,
        elapsedTime,
        this._material,
        this._wavesEnabled,
        this._waveSample
      );
      const errorX = wave.displacedX - worldPosition.x;
      const errorZ = wave.displacedZ - worldPosition.z;
      const horizontalError = Math.hypot(errorX, errorZ);
      outStatus.iterations = iteration + 1;
      outStatus.horizontalError = horizontalError;
      if (horizontalError <= INVERSE_ERROR_TOLERANCE) {
        outStatus.hit = true;
        outStatus.converged = true;
        outSample.waterBodyId = this._config.waterBodyId;
        outSample.surfacePosition.set(worldPosition.x, wave.displacedY, worldPosition.z);
        outSample.surfaceNormal.set(wave.normalX, wave.normalY, wave.normalZ);
        outSample.waterVelocity.set(
          base.flowVectorXZ[0] + wave.displacementVelocityX,
          wave.displacementVelocityY,
          base.flowVectorXZ[1] + wave.displacementVelocityZ
        );
        outSample.waterDepth = Math.max(0, base.depth + wave.displacedY - base.surfaceHeight);
        return true;
      }
      restX = worldPosition.x - base.surfaceNormal[0] * wave.waveOffset;
      restZ = worldPosition.z - base.surfaceNormal[2] * wave.waveOffset;
    }
    outStatus.capabilityFallback = WaterSurfaceQueryFallback.NonConverged;
    return false;
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
      throw new RangeError("Heightfield water batch output capacity is smaller than the position count.");
    }
  }
}
