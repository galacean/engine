/** Common bathymetry/SDF adapter over one compiled River query service. */
import { Vector3 } from "@galacean/engine-math";
import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";
import type { RiverCompiledData } from "../../compiler/river/types";
import { waterLocalBoundsToWorld, type CompiledWaterPlanarTransformV1 } from "../body/WaterPlanarTransform";
import {
  WATER_SPATIAL_FIELD_OUTSIDE_UNRESOLVED,
  WATER_SPATIAL_FIELD_VERSION,
  WaterSpatialFieldChannel,
  WaterSpatialFieldRegion,
  resetWaterSpatialFieldSample,
  waterSpatialFieldSnapshot,
  type WaterSpatialFieldGpuBinding,
  type WaterSpatialFieldMetadata,
  type WaterSpatialFieldProvider,
  type WaterSpatialFieldSample
} from "../spatial/WaterSpatialFieldProvider";
import { createRiverNetworkQueryResult, type RiverNetworkQueryService } from "./RiverQueryService";
import { assertWaterQueryBounds } from "../spatial/WaterBoundsQuery";
import {
  guardWaterNearShoreTask,
  resetWaterNearShoreSample,
  type WaterNearShoreQuery
} from "../spatial/WaterNearShoreQuery";

export interface RiverWaterSpatialFieldProviderOptions {
  readonly sourceHash: string;
  readonly compiledHash?: string;
  readonly sourceSchemaVersion?: number;
  readonly bounds: WaterBoundsXZ;
  readonly sampleStep?: number;
}

export function getRiverWaterSpatialBounds(data: RiverCompiledData): WaterBoundsXZ {
  const bounds = data.queryIndex.primitiveBounds.borrowTypedArray();
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < bounds.length; offset += 4) {
    minX = Math.min(minX, bounds[offset]);
    minZ = Math.min(minZ, bounds[offset + 1]);
    maxX = Math.max(maxX, bounds[offset + 2]);
    maxZ = Math.max(maxZ, bounds[offset + 3]);
  }
  return Number.isFinite(minX) ? { minX, minZ, maxX, maxZ } : { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
}

export class RiverWaterSpatialFieldProvider implements WaterSpatialFieldProvider {
  readonly metadata: WaterSpatialFieldMetadata;
  readonly nearShore: WaterNearShoreQuery;
  private readonly _position = new Vector3();
  private readonly _center = createRiverNetworkQueryResult();
  private readonly _negativeX = createRiverNetworkQueryResult();
  private readonly _positiveX = createRiverNetworkQueryResult();
  private readonly _negativeZ = createRiverNetworkQueryResult();
  private readonly _positiveZ = createRiverNetworkQueryResult();
  private readonly _sampleStep: number;
  private _active = true;

  constructor(
    private readonly _query: RiverNetworkQueryService,
    options: RiverWaterSpatialFieldProviderOptions
  ) {
    this._sampleStep = Math.max(0.01, options.sampleStep ?? 0.25);
    this.nearShore = Object.freeze({
      radiusM: _query.nearShore.radiusM,
      prepare: (now, budgetMs) => this._active && _query.nearShore.prepare(now, budgetMs),
      createTask: (x, z, out) =>
        guardWaterNearShoreTask(_query.nearShore.createTask(x, z, out), out, () => this._active),
      sample: (x, z, out) => {
        resetWaterNearShoreSample(out);
        return this._active && _query.nearShore.sample(x, z, out);
      }
    } satisfies WaterNearShoreQuery);
    this.metadata = Object.freeze({
      version: WATER_SPATIAL_FIELD_VERSION,
      sourceSchemaVersion: options.sourceSchemaVersion ?? 1,
      sourceHash: options.sourceHash,
      compiledHash: options.compiledHash ?? options.sourceHash,
      storage: "river-query-index",
      channels:
        WaterSpatialFieldChannel.Bathymetry |
        WaterSpatialFieldChannel.ShoreSignedDistance |
        WaterSpatialFieldChannel.ShoreNormal |
        WaterSpatialFieldChannel.Current,
      bounds: Object.freeze({ ...options.bounds }),
      outsidePolicy: WATER_SPATIAL_FIELD_OUTSIDE_UNRESOLVED,
      maximumHorizontalError: this._sampleStep,
      maximumDepthError: 0
    });
  }

  sampleSpatialField(worldX: number, worldZ: number, outSample: WaterSpatialFieldSample): boolean {
    resetWaterSpatialFieldSample(outSample);
    if (!this._active) {
      outSample.region = WaterSpatialFieldRegion.OutsideUnresolved;
      return false;
    }
    if (!this._sample(worldX, worldZ, this._center)) {
      outSample.region = WaterSpatialFieldRegion.OutsideUnresolved;
      return false;
    }
    const center = this._center;
    outSample.resolved = true;
    outSample.insideField = true;
    outSample.wet = center.insideFootprint;
    outSample.validChannels =
      WaterSpatialFieldChannel.ShoreSignedDistance |
      WaterSpatialFieldChannel.ShoreNormal |
      WaterSpatialFieldChannel.Current |
      (center.insideFootprint ? WaterSpatialFieldChannel.Bathymetry : WaterSpatialFieldChannel.None);
    outSample.region = center.insideFootprint ? WaterSpatialFieldRegion.InsideWet : WaterSpatialFieldRegion.InsideDry;
    outSample.surfaceHeight = center.surfaceHeight;
    outSample.waterDepth = center.waterDepth;
    outSample.bedHeight = center.surfaceHeight - center.waterDepth;
    outSample.shoreSignedDistance = center.distanceToBank;
    outSample.currentX = center.flowVector.x;
    outSample.currentZ = center.flowVector.z;
    this._sampleShoreNormal(worldX, worldZ, outSample);
    return true;
  }

  destroy(): void {
    this._active = false;
  }

  maximumSurfaceHeightInBounds(bounds: WaterBoundsXZ): number | null {
    if (!this._active) throw new Error("River Spatial Field has been retired.");
    return this._query.maximumSurfaceHeightInBounds(bounds);
  }

  capture() {
    if (!this._active) throw new Error("River Spatial Field has been retired.");
    return waterSpatialFieldSnapshot(
      new RiverWaterSpatialFieldProvider(this._query.capture(), {
        ...this.metadata,
        sampleStep: this._sampleStep
      })
    );
  }

  private _sample(worldX: number, worldZ: number, out: ReturnType<typeof createRiverNetworkQueryResult>): boolean {
    this._position.set(worldX, 0, worldZ);
    return this._query.sampleSurface(this._position, out);
  }

  private _sampleShoreNormal(worldX: number, worldZ: number, outSample: WaterSpatialFieldSample): void {
    const step = this._sampleStep;
    const negativeX = this._sample(worldX - step, worldZ, this._negativeX)
      ? this._negativeX.distanceToBank
      : Number.NaN;
    const positiveX = this._sample(worldX + step, worldZ, this._positiveX)
      ? this._positiveX.distanceToBank
      : Number.NaN;
    const negativeZ = this._sample(worldX, worldZ - step, this._negativeZ)
      ? this._negativeZ.distanceToBank
      : Number.NaN;
    const positiveZ = this._sample(worldX, worldZ + step, this._positiveZ)
      ? this._positiveZ.distanceToBank
      : Number.NaN;
    const gradientX = Number.isFinite(negativeX) && Number.isFinite(positiveX) ? (positiveX - negativeX) / 2 : 0;
    const gradientZ = Number.isFinite(negativeZ) && Number.isFinite(positiveZ) ? (positiveZ - negativeZ) / 2 : 0;
    const length = Math.hypot(gradientX, gradientZ);
    if (length <= 1e-8) return;
    outSample.shoreNormalX = -gradientX / length;
    outSample.shoreNormalZ = -gradientZ / length;
  }
}

/** World-facing transform adapter over a stable body-local River field. */
export class TransformedRiverWaterSpatialFieldProvider implements WaterSpatialFieldProvider {
  readonly metadata: WaterSpatialFieldMetadata;
  readonly gpuBinding: WaterSpatialFieldGpuBinding | undefined;
  readonly nearShore?: WaterNearShoreQuery;

  constructor(
    private readonly _source: WaterSpatialFieldProvider,
    private readonly _logicalBodyOrigin: readonly [x: number, z: number],
    private readonly _planarTransform: Readonly<CompiledWaterPlanarTransformV1>
  ) {
    const nearShore = _source.nearShore;
    if (nearShore)
      this.nearShore = Object.freeze({
        radiusM: nearShore.radiusM,
        prepare: nearShore.prepare?.bind(nearShore),
        ...(nearShore.createTask && {
          createTask: (x: number, z: number, out: import("../spatial/WaterNearShoreQuery").WaterNearShoreSample) => {
            const dx = x - _logicalBodyOrigin[0] - _planarTransform.source.position[0],
              dz = z - _logicalBodyOrigin[1] - _planarTransform.source.position[2];
            return guardWaterNearShoreTask(
              nearShore.createTask!(
                dx * _planarTransform.cosine - dz * _planarTransform.sine,
                dx * _planarTransform.sine + dz * _planarTransform.cosine,
                out
              ),
              out,
              () => true,
              _planarTransform.source.position[1]
            );
          }
        }),
        sample: (x, z, out) => {
          const dx = x - _logicalBodyOrigin[0] - _planarTransform.source.position[0];
          const dz = z - _logicalBodyOrigin[1] - _planarTransform.source.position[2];
          const localX = dx * _planarTransform.cosine - dz * _planarTransform.sine;
          const localZ = dx * _planarTransform.sine + dz * _planarTransform.cosine;
          if (!nearShore.sample(localX, localZ, out)) return false;
          out.surfaceHeight += _planarTransform.source.position[1];
          return true;
        }
      } satisfies WaterNearShoreQuery);
    const metadata = _source.metadata;
    const bounds = waterLocalBoundsToWorld(_planarTransform, {
      minimum: { x: metadata.bounds.minX, y: 0, z: metadata.bounds.minZ },
      maximum: { x: metadata.bounds.maxX, y: 0, z: metadata.bounds.maxZ }
    });
    this.metadata = Object.freeze({
      ...metadata,
      bounds: Object.freeze({
        minX: bounds.minimum.x + _logicalBodyOrigin[0],
        minZ: bounds.minimum.z + _logicalBodyOrigin[1],
        maxX: bounds.maximum.x + _logicalBodyOrigin[0],
        maxZ: bounds.maximum.z + _logicalBodyOrigin[1]
      })
    });
    const binding = _source.gpuBinding;
    if (!binding) {
      this.gpuBinding = undefined;
      return;
    }
    const localWorldToUv = binding.worldToUv;
    if (!localWorldToUv) {
      this.gpuBinding = undefined;
      return;
    }
    const transform = _planarTransform;
    const totalX = _logicalBodyOrigin[0] + transform.source.position[0];
    const totalZ = _logicalBodyOrigin[1] + transform.source.position[2];
    const scaleX = localWorldToUv[0];
    const scaleZ = localWorldToUv[1];
    const cosine = transform.cosine;
    const sine = transform.sine;
    const axisAligned = Math.abs(sine) <= 1e-12;
    const affine = Object.freeze([
      scaleX * cosine,
      axisAligned ? 0 : -scaleX * sine,
      localWorldToUv[2] - totalX * scaleX * cosine + totalZ * scaleX * sine,
      axisAligned ? 0 : scaleZ * sine,
      scaleZ * cosine,
      localWorldToUv[3] - totalX * scaleZ * sine - totalZ * scaleZ * cosine
    ] as const);
    this.gpuBinding = Object.freeze({
      version: binding.version,
      sourceHash: binding.sourceHash,
      compiledHash: binding.compiledHash,
      texture: binding.texture,
      worldToUv: axisAligned ? Object.freeze([affine[0], affine[4], affine[2], affine[5]] as const) : undefined,
      worldToUvAffine: affine,
      channels: binding.channels,
      decode: binding.decode,
      maximumDepthDecodeError: binding.maximumDepthDecodeError,
      maximumShoreDecodeError: binding.maximumShoreDecodeError
    });
  }

  sampleSpatialField(worldX: number, worldZ: number, outSample: WaterSpatialFieldSample): boolean {
    const transform = this._planarTransform;
    const relativeX = worldX - this._logicalBodyOrigin[0] - transform.source.position[0];
    const relativeZ = worldZ - this._logicalBodyOrigin[1] - transform.source.position[2];
    const localX = relativeX * transform.cosine - relativeZ * transform.sine;
    const localZ = relativeX * transform.sine + relativeZ * transform.cosine;
    if (!this._source.sampleSpatialField(localX, localZ, outSample)) return false;

    const verticalOffset = this._planarTransform.source.position[1];
    outSample.surfaceHeight += verticalOffset;
    outSample.bedHeight += verticalOffset;
    const shoreNormalX = outSample.shoreNormalX;
    const shoreNormalZ = outSample.shoreNormalZ;
    outSample.shoreNormalX = shoreNormalX * transform.cosine + shoreNormalZ * transform.sine;
    outSample.shoreNormalZ = -shoreNormalX * transform.sine + shoreNormalZ * transform.cosine;
    const currentX = outSample.currentX;
    const currentZ = outSample.currentZ;
    outSample.currentX = currentX * transform.cosine + currentZ * transform.sine;
    outSample.currentZ = -currentX * transform.sine + currentZ * transform.cosine;
    return true;
  }

  capture() {
    if (!this._source.capture) throw new Error("River Spatial Field source cannot capture static facts.");
    return waterSpatialFieldSnapshot(
      new TransformedRiverWaterSpatialFieldProvider(
        this._source.capture(),
        this._logicalBodyOrigin,
        this._planarTransform
      )
    );
  }

  maximumSurfaceHeightInBounds(bounds: WaterBoundsXZ): number | null {
    assertWaterQueryBounds(bounds);
    if (!this._source.maximumSurfaceHeightInBounds) throw new Error("River Spatial Field has no bounds query.");
    const t = this._planarTransform;
    const points = [bounds.minX, bounds.maxX].flatMap((x) =>
      [bounds.minZ, bounds.maxZ].map((z) => {
        const dx = x - this._logicalBodyOrigin[0] - t.source.position[0];
        const dz = z - this._logicalBodyOrigin[1] - t.source.position[2];
        return [dx * t.cosine - dz * t.sine, dx * t.sine + dz * t.cosine];
      })
    );
    const maximum = this._source.maximumSurfaceHeightInBounds({
      minX: Math.min(...points.map((p) => p[0])),
      maxX: Math.max(...points.map((p) => p[0])),
      minZ: Math.min(...points.map((p) => p[1])),
      maxZ: Math.max(...points.map((p) => p[1]))
    });
    return maximum === null ? null : maximum + t.source.position[1];
  }
}
