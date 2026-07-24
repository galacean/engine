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
import {
  createOceanNearshoreFieldSample,
  OceanNearshoreSampleRegion,
  type OceanNearshoreFieldProvider,
  type OceanNearshoreFieldSample
} from "./OceanNearshoreFieldProvider";
import {
  createOceanNearshoreStateSample,
  type OceanNearshoreStateField,
  type OceanNearshoreStateSample
} from "./OceanNearshoreStateField";
import {
  createOceanNearshoreWaveDerivatives,
  createOceanNearshoreWaveDirection,
  createOceanNearshoreWaveModifier,
  evaluateOceanNearshoreWaveSet
} from "./OceanNearshoreWaveEvaluator";

const NEARSHORE_ITERATION_LIMIT: Readonly<Record<WaterQueryAccuracy, number>> = {
  [WaterQueryAccuracy.Fast]: 6,
  [WaterQueryAccuracy.Precise]: 12
};

const NEARSHORE_ERROR_TOLERANCE: Readonly<
  Record<WaterQueryAccuracy, number>
> = {
  [WaterQueryAccuracy.Fast]: 0.002,
  [WaterQueryAccuracy.Precise]: 0.00001
};

const MINIMUM_NEARSHORE_JACOBIAN_DETERMINANT = 1e-8;
const NEARSHORE_NUMERICAL_JACOBIAN_CELL_FRACTION = 0.02;
const MINIMUM_NEARSHORE_NUMERICAL_JACOBIAN_STEP = 0.005;
const MAXIMUM_NEARSHORE_NUMERICAL_JACOBIAN_STEP = 0.1;
const NEARSHORE_LINE_SEARCH_LIMIT = 4;

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
  /** Optional bounded nearshore field sampled at inverse-solved rest XZ. */
  readonly nearshoreField?: OceanNearshoreFieldProvider;
  /** Optional dynamic occupancy/current state sharing the same compiled field. */
  readonly nearshoreState?: OceanNearshoreStateField;
}

export class OceanWaterSurfaceProvider implements BatchWaterSurfaceProvider {
  private readonly _waveSample = createWaterWaveSampleOutput();
  private readonly _inverse = createGerstnerInverseQueryResult();
  private readonly _status = createWaterSurfaceQueryStatus();
  private readonly _batchPosition = new Vector3();
  private readonly _batchSample = createWaterSurfaceSample();
  private readonly _nearshoreSample: OceanNearshoreFieldSample =
    createOceanNearshoreFieldSample();
  private readonly _nearshoreStateSample: OceanNearshoreStateSample =
    createOceanNearshoreStateSample();
  private readonly _nearshoreWaveModifier =
    createOceanNearshoreWaveModifier();
  private readonly _nearshoreWaveDirection =
    createOceanNearshoreWaveDirection();
  private readonly _nearshoreWaveDerivatives =
    createOceanNearshoreWaveDerivatives();
  private readonly _nearshoreWaveFacts: {
    waterDepth: number;
    shoreDistance: number;
    shoreNormalX: number;
    shoreNormalZ: number;
  } = {
    waterDepth: Number.POSITIVE_INFINITY,
    shoreDistance: 0,
    shoreNormalX: 0,
    shoreNormalZ: 0
  };
  private _waterBodyId: string;
  private _waveSet: CompiledWaterWaveSet;
  private _halfSize: number;
  private _waterLevel: number;
  private _timeScale: number;
  private _getElapsedTime: () => number;
  private _accuracy: WaterQueryAccuracy;
  private _waterDepth: number;
  private _unbounded: boolean;
  private _nearshoreField?: OceanNearshoreFieldProvider;
  private _nearshoreState?: OceanNearshoreStateField;
  private _nearshoreRegion = OceanNearshoreSampleRegion.Invalid;
  private _nearshoreStateAvailable = false;

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
    this._nearshoreField = config.nearshoreField;
    this._nearshoreState = config.nearshoreState;
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
    this._nearshoreField = config.nearshoreField;
    this._nearshoreState = config.nearshoreState;
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
    const elapsedTime = Math.max(0, this._getElapsedTime());
    const converged = this._nearshoreField
      ? this._solveNearshoreSurfaceAtWorldXZ(
          worldPosition.x,
          worldPosition.z,
          elapsedTime,
          outStatus
        )
      : solveGerstnerSurfaceAtWorldXZ(
          this._waveSet,
          worldPosition.x,
          this._waterLevel,
          worldPosition.z,
          elapsedTime,
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
    let waterDepth = this._waterDepth;
    let currentX = 0;
    let currentZ = 0;
    if (this._nearshoreField) {
      const region = this._nearshoreRegion;
      if (
        region === OceanNearshoreSampleRegion.InsideDry ||
        region === OceanNearshoreSampleRegion.OutsideDry
      ) {
        if (
          region === OceanNearshoreSampleRegion.InsideDry &&
          this._nearshoreStateAvailable &&
          this._nearshoreStateSample.occupied
        ) {
          waterDepth = Math.max(
            0,
            this._nearshoreStateSample.surfaceHeight -
              this._nearshoreSample.bedHeight
          );
          currentX = this._nearshoreStateSample.currentX;
          currentZ = this._nearshoreStateSample.currentZ;
        } else {
          resetWaterSurfaceQueryStatus(outStatus);
          outStatus.converged = true;
          outStatus.capabilityFallback = WaterSurfaceQueryFallback.OutsideFootprint;
          return false;
        }
      } else if (region === OceanNearshoreSampleRegion.Invalid) {
        resetWaterSurfaceQueryStatus(outStatus);
        outStatus.capabilityFallback = WaterSurfaceQueryFallback.NonConverged;
        return false;
      } else if (region === OceanNearshoreSampleRegion.InsideWet) {
        waterDepth = Math.max(
          0,
          wave.displacedY - this._nearshoreSample.bedHeight
        );
        currentX = this._nearshoreStateAvailable
          ? this._nearshoreStateSample.currentX
          : this._nearshoreSample.baseCurrentX;
        currentZ = this._nearshoreStateAvailable
          ? this._nearshoreStateSample.currentZ
          : this._nearshoreSample.baseCurrentZ;
      }
    }
    outSample.waterBodyId = this._waterBodyId;
    outSample.surfacePosition.set(worldPosition.x, wave.displacedY, worldPosition.z);
    outSample.surfaceNormal.set(wave.normalX, wave.normalY, wave.normalZ);
    outSample.waterVelocity.set(
      currentX + wave.horizontalVelocityX,
      wave.verticalVelocity,
      currentZ + wave.horizontalVelocityZ
    );
    outSample.waterDepth = waterDepth;
    outStatus.hit = true;
    return true;
  }

  private _solveNearshoreSurfaceAtWorldXZ(
    worldX: number,
    worldZ: number,
    elapsedTime: number,
    outStatus: WaterSurfaceQueryStatus
  ): boolean {
    resetWaterSurfaceQueryStatus(outStatus);
    this._inverse.restX = Number.isFinite(worldX) ? worldX : 0;
    this._inverse.restZ = Number.isFinite(worldZ) ? worldZ : 0;
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
      outStatus.capabilityFallback = WaterSurfaceQueryFallback.NonConverged;
      return false;
    }
    const iterationLimit = NEARSHORE_ITERATION_LIMIT[this._accuracy];
    const tolerance = NEARSHORE_ERROR_TOLERANCE[this._accuracy];
    const maximumCorrection = Math.max(
      0.25,
      this._waveSet.maxHorizontalDisplacement * 3
    );
    const grid = this._nearshoreField?.resource.data.grid;
    const numericalStep = Math.min(
      MAXIMUM_NEARSHORE_NUMERICAL_JACOBIAN_STEP,
      Math.max(
        MINIMUM_NEARSHORE_NUMERICAL_JACOBIAN_STEP,
        Math.min(
          grid?.cellSizeXZ[0] ?? 1,
          grid?.cellSizeXZ[1] ?? 1
        ) * NEARSHORE_NUMERICAL_JACOBIAN_CELL_FRACTION
      )
    );
    for (let iteration = 0; iteration < iterationLimit; iteration++) {
      if (!this._evaluateNearshoreRest(elapsedTime)) {
        outStatus.capabilityFallback = WaterSurfaceQueryFallback.NonConverged;
        return false;
      }
      const errorX = this._waveSample.displacedX - worldX;
      const errorZ = this._waveSample.displacedZ - worldZ;
      const horizontalError = Math.hypot(errorX, errorZ);
      outStatus.iterations = iteration + 1;
      outStatus.horizontalError = horizontalError;
      if (horizontalError <= tolerance) {
        outStatus.hit = true;
        outStatus.converged = true;
        return true;
      }
      const baseRestX = this._inverse.restX;
      const baseRestZ = this._inverse.restZ;
      const baseDerivativeXX = this._waveSample.derivativeXX;
      const baseDerivativeXZ = this._waveSample.derivativeXZ;
      const baseDerivativeZX = this._waveSample.derivativeZX;
      const baseDerivativeZZ = this._waveSample.derivativeZZ;
      let derivativeXX = baseDerivativeXX;
      let derivativeXZ = baseDerivativeXZ;
      let derivativeZX = baseDerivativeZX;
      let derivativeZZ = baseDerivativeZZ;
      if (this._nearshoreWaveModifier.influence > 0) {
        this._inverse.restX = baseRestX + numericalStep;
        this._inverse.restZ = baseRestZ;
        const positiveXValid = this._evaluateNearshoreRest(elapsedTime);
        const displacedPositiveXX = this._waveSample.displacedX;
        const displacedPositiveXZ = this._waveSample.displacedZ;
        this._inverse.restX = baseRestX - numericalStep;
        const negativeXValid = this._evaluateNearshoreRest(elapsedTime);
        const displacedNegativeXX = this._waveSample.displacedX;
        const displacedNegativeXZ = this._waveSample.displacedZ;
        this._inverse.restX = baseRestX;
        this._inverse.restZ = baseRestZ + numericalStep;
        const positiveZValid = this._evaluateNearshoreRest(elapsedTime);
        const displacedPositiveZX = this._waveSample.displacedX;
        const displacedPositiveZZ = this._waveSample.displacedZ;
        this._inverse.restZ = baseRestZ - numericalStep;
        const negativeZValid = this._evaluateNearshoreRest(elapsedTime);
        const displacedNegativeZX = this._waveSample.displacedX;
        const displacedNegativeZZ = this._waveSample.displacedZ;
        this._inverse.restX = baseRestX;
        this._inverse.restZ = baseRestZ;
        if (
          positiveXValid &&
          negativeXValid &&
          positiveZValid &&
          negativeZValid
        ) {
          const inverseDoubleStep = 1 / (numericalStep * 2);
          derivativeXX =
            (displacedPositiveXX - displacedNegativeXX) *
            inverseDoubleStep;
          derivativeZX =
            (displacedPositiveXZ - displacedNegativeXZ) *
            inverseDoubleStep;
          derivativeXZ =
            (displacedPositiveZX - displacedNegativeZX) *
            inverseDoubleStep;
          derivativeZZ =
            (displacedPositiveZZ - displacedNegativeZZ) *
            inverseDoubleStep;
        }
      }
      const determinant =
        derivativeXX * derivativeZZ - derivativeXZ * derivativeZX;
      if (
        !Number.isFinite(determinant) ||
        Math.abs(determinant) <= MINIMUM_NEARSHORE_JACOBIAN_DETERMINANT
      ) {
        break;
      }
      let correctionX =
        (derivativeZZ * errorX -
          derivativeXZ * errorZ) /
        determinant;
      let correctionZ =
        (-derivativeZX * errorX +
          derivativeXX * errorZ) /
        determinant;
      const correctionLength = Math.hypot(correctionX, correctionZ);
      if (!Number.isFinite(correctionLength)) break;
      if (correctionLength > maximumCorrection) {
        const correctionScale = maximumCorrection / correctionLength;
        correctionX *= correctionScale;
        correctionZ *= correctionScale;
      }
      let accepted = false;
      let lineSearchScale = 1;
      for (
        let searchIndex = 0;
        searchIndex < NEARSHORE_LINE_SEARCH_LIMIT;
        searchIndex++
      ) {
        this._inverse.restX =
          baseRestX - correctionX * lineSearchScale;
        this._inverse.restZ =
          baseRestZ - correctionZ * lineSearchScale;
        if (this._evaluateNearshoreRest(elapsedTime)) {
          const candidateError = Math.hypot(
            this._waveSample.displacedX - worldX,
            this._waveSample.displacedZ - worldZ
          );
          if (
            Number.isFinite(candidateError) &&
            candidateError < horizontalError
          ) {
            accepted = true;
            break;
          }
        }
        lineSearchScale *= 0.5;
      }
      if (!accepted) {
        this._inverse.restX = baseRestX;
        this._inverse.restZ = baseRestZ;
        break;
      }
    }
    this._evaluateNearshoreRest(elapsedTime);
    outStatus.horizontalError = Math.hypot(
      this._waveSample.displacedX - worldX,
      this._waveSample.displacedZ - worldZ
    );
    outStatus.capabilityFallback = WaterSurfaceQueryFallback.NonConverged;
    return false;
  }

  private _evaluateNearshoreRest(elapsedTime: number): boolean {
    const field = this._nearshoreField;
    if (!field) return false;
    this._nearshoreRegion = field.sample(
      this._inverse.restX,
      this._inverse.restZ,
      this._nearshoreSample
    );
    if (this._nearshoreRegion === OceanNearshoreSampleRegion.Invalid) {
      return false;
    }
    this._nearshoreStateAvailable =
      this._nearshoreState?.sample(
        this._inverse.restX,
        this._inverse.restZ,
        this._nearshoreStateSample
      ) ?? false;
    if (
      this._nearshoreRegion === OceanNearshoreSampleRegion.InsideDry ||
      this._nearshoreRegion === OceanNearshoreSampleRegion.OutsideDry
    ) {
      const surfaceHeight =
        this._nearshoreRegion === OceanNearshoreSampleRegion.InsideDry &&
        this._nearshoreStateAvailable &&
        this._nearshoreStateSample.occupied
          ? this._nearshoreStateSample.surfaceHeight
          : this._waterLevel;
      this._setFlatWaveSample(surfaceHeight);
      return true;
    }
    const facts = this._nearshoreWaveFacts;
    if (this._nearshoreRegion === OceanNearshoreSampleRegion.InsideWet) {
      facts.waterDepth = this._nearshoreSample.waterDepth;
      facts.shoreDistance = this._nearshoreSample.shoreDistance;
      facts.shoreNormalX = this._nearshoreSample.shoreNormalX;
      facts.shoreNormalZ = this._nearshoreSample.shoreNormalZ;
    } else {
      facts.waterDepth = Number.POSITIVE_INFINITY;
      facts.shoreDistance = Number.POSITIVE_INFINITY;
      facts.shoreNormalX = 0;
      facts.shoreNormalZ = 0;
    }
    evaluateOceanNearshoreWaveSet(
      this._waveSet,
      this._inverse.restX,
      this._waterLevel,
      this._inverse.restZ,
      elapsedTime,
      this._timeScale,
      this._accuracy,
      facts,
      this._waveSample,
      this._nearshoreWaveModifier,
      this._nearshoreWaveDirection,
      this._nearshoreWaveDerivatives
    );
    return true;
  }

  private _setFlatWaveSample(surfaceHeight: number): void {
    const wave = this._waveSample;
    wave.displacedX = this._inverse.restX;
    wave.displacedY = Number.isFinite(surfaceHeight)
      ? surfaceHeight
      : this._waterLevel;
    wave.displacedZ = this._inverse.restZ;
    wave.normalX = 0;
    wave.normalY = 1;
    wave.normalZ = 0;
    wave.horizontalVelocityX = 0;
    wave.verticalVelocity = 0;
    wave.horizontalVelocityZ = 0;
    wave.derivativeXX = 1;
    wave.derivativeXZ = 0;
    wave.derivativeZX = 0;
    wave.derivativeZZ = 1;
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
