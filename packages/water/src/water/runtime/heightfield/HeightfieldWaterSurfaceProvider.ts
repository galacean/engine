import { sampleWaterConnection } from "../../authoring/connections/WaterConnection";
/** Final visible-surface provider over compiled heightfield water. */
import { Vector3 } from "@galacean/engine-math";
import type { HeightfieldWaterSurfaceMotionConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { HeightfieldWaterCompiledData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { CompiledWaterPlanarTransformV1 } from "../body/WaterPlanarTransform";
import {
  createWaterSurfaceQueryStatus,
  createWaterSurfaceSample,
  resetWaterSurfaceQueryStatus,
  resetWaterSurfaceSample,
  WaterSurfaceQueryFallback,
  type BatchWaterSurfaceProvider,
  type DetailedWaterSurfaceProvider,
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
  /** Must be the same transform owned by query, spatial, renderer, and reflection placement. */
  readonly planarTransform?: Readonly<CompiledWaterPlanarTransformV1>;
}

export class HeightfieldWaterSurfaceProvider implements BatchWaterSurfaceProvider, DetailedWaterSurfaceProvider {
  private readonly _baseSample = createHeightfieldWaterBaseQueryResult();
  private readonly _waveSample = createHeightfieldWaterWaveSample();
  private readonly _status = createWaterSurfaceQueryStatus();
  private readonly _batchPosition = new Vector3();
  private readonly _batchSample = createWaterSurfaceSample();
  private _surfaceMotion: HeightfieldWaterSurfaceMotionConfig;
  private _wavesEnabled: boolean;
  private _surfaceTimeOverride?: number;
  private readonly _planarTransform: Readonly<CompiledWaterPlanarTransformV1>;

  constructor(private readonly _config: HeightfieldWaterSurfaceProviderConfig) {
    this._surfaceMotion = _config.data.surfaceMotion;
    this._wavesEnabled = _config.wavesEnabled ?? true;
    this._planarTransform = _config.planarTransform ?? _config.queryService.planarTransform;
    if (this._planarTransform !== _config.queryService.planarTransform) {
      throw new Error("Heightfield surface and base-query planar transforms must share one compiled instance.");
    }
  }

  setSurfaceMotion(config: HeightfieldWaterSurfaceMotionConfig): void {
    this._surfaceMotion = config;
  }

  setWavesEnabled(enabled: boolean): void {
    this._wavesEnabled = enabled;
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    this._surfaceTimeOverride = elapsedTime;
  }

  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
    return this.sampleSurfaceDetailed(worldPosition, outSample, this._status);
  }

  sampleSurfaceDetailed(
    worldPosition: Vector3,
    outSample: WaterSurfaceSample,
    outStatus: WaterSurfaceQueryStatus
  ): boolean {
    resetWaterSurfaceSample(outSample);
    resetWaterSurfaceQueryStatus(outStatus);
    if (!this._config.queryService.available) {
      outStatus.capabilityFallback = WaterSurfaceQueryFallback.Unsupported;
      return false;
    }
    if (!Number.isFinite(worldPosition.x) || !Number.isFinite(worldPosition.z)) {
      outStatus.capabilityFallback = WaterSurfaceQueryFallback.NonConverged;
      return false;
    }
    const elapsedTime = this._surfaceTimeOverride ?? this._config.getElapsedTime();
    const transform = this._planarTransform;
    const deltaX = worldPosition.x - transform.source.position[0];
    const deltaZ = worldPosition.z - transform.source.position[2];
    const targetLocalX = deltaX * transform.cosine - deltaZ * transform.sine;
    const targetLocalZ = deltaX * transform.sine + deltaZ * transform.cosine;
    let restX = targetLocalX;
    let restZ = targetLocalZ;
    for (let iteration = 0; iteration < INVERSE_ITERATION_LIMIT; iteration++) {
      const base = this._config.queryService.sampleBaseSurfaceLocal(restX, restZ, this._baseSample);
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
        this._surfaceMotion,
        this._wavesEnabled,
        this._waveSample
      );
      if (this._config.data.connections) {
        const weight = sampleWaterConnection(this._config.data.connections, restX, restZ).motion;
        wave.waveOffset *= weight;
        wave.displacedX = restX + (wave.displacedX - restX) * weight;
        wave.displacedZ = restZ + (wave.displacedZ - restZ) * weight;
        wave.displacedY = base.surfaceHeight + (wave.displacedY - base.surfaceHeight) * weight;
        wave.displacementVelocityX *= weight;
        wave.displacementVelocityY *= weight;
        wave.displacementVelocityZ *= weight;
        wave.normalX *= weight;
        wave.normalZ *= weight;
        wave.normalY = 1 + (wave.normalY - 1) * weight;
        const normalLength = Math.hypot(wave.normalX, wave.normalY, wave.normalZ);
        wave.normalX /= normalLength;
        wave.normalY /= normalLength;
        wave.normalZ /= normalLength;
      }
      const errorX = wave.displacedX - targetLocalX;
      const errorZ = wave.displacedZ - targetLocalZ;
      const horizontalError = Math.hypot(errorX, errorZ);
      outStatus.iterations = iteration + 1;
      outStatus.horizontalError = horizontalError;
      if (horizontalError <= INVERSE_ERROR_TOLERANCE) {
        outStatus.hit = true;
        outStatus.converged = true;
        outSample.waterBodyId = this._config.waterBodyId;
        outSample.surfacePosition.set(worldPosition.x, transform.source.position[1] + wave.displacedY, worldPosition.z);
        outSample.surfaceNormal.set(
          wave.normalX * transform.cosine + wave.normalZ * transform.sine,
          wave.normalY,
          -wave.normalX * transform.sine + wave.normalZ * transform.cosine
        );
        const localVelocityX = base.flowVectorXZ[0] + wave.displacementVelocityX;
        const localVelocityZ = base.flowVectorXZ[1] + wave.displacementVelocityZ;
        outSample.waterVelocity.set(
          localVelocityX * transform.cosine + localVelocityZ * transform.sine,
          wave.displacementVelocityY,
          -localVelocityX * transform.sine + localVelocityZ * transform.cosine
        );
        outSample.waterDepth = Math.max(0, base.depth + wave.displacedY - base.surfaceHeight);
        return true;
      }
      restX = targetLocalX - base.surfaceNormal[0] * wave.waveOffset;
      restZ = targetLocalZ - base.surfaceNormal[2] * wave.waveOffset;
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
      const hit = this.sampleSurfaceDetailed(this._batchPosition, this._batchSample, this._status);
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
