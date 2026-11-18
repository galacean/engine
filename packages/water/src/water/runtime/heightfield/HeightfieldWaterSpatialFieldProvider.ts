/** Common bathymetry/SDF adapter over immutable Heightfield compiler facts. */
import type { Texture } from "@galacean/engine-core";
import type { HeightfieldWaterCompiledData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import {
  compileWaterPlanarTransform,
  waterLocalBoundsToWorld,
  type CompiledWaterPlanarTransformV1
} from "../body/WaterPlanarTransform";
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
import {
  createHeightfieldWaterBaseQueryResult,
  HeightfieldWaterBaseQueryService
} from "./HeightfieldWaterQueryService";
import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";
import { assertWaterQueryBounds, polygonWaterBoundsOverlap } from "../spatial/WaterBoundsQuery";
import { heightfieldNearShoreQuery } from "./HeightfieldNearShoreQuery";
import {
  WATER_NEAR_SHORE_RADIUS_M,
  resetWaterNearShoreSample,
  guardWaterNearShoreTask,
  type WaterNearShoreQuery
} from "../spatial/WaterNearShoreQuery";

export class HeightfieldWaterSpatialFieldProvider implements WaterSpatialFieldProvider {
  readonly metadata: WaterSpatialFieldMetadata;
  readonly nearShore?: WaterNearShoreQuery;
  private readonly _gpuBinding?: WaterSpatialFieldGpuBinding;
  private readonly _query: HeightfieldWaterBaseQueryService;
  private readonly _center = createHeightfieldWaterBaseQueryResult();
  private readonly _negativeX = createHeightfieldWaterBaseQueryResult();
  private readonly _positiveX = createHeightfieldWaterBaseQueryResult();
  private readonly _negativeZ = createHeightfieldWaterBaseQueryResult();
  private readonly _positiveZ = createHeightfieldWaterBaseQueryResult();
  private readonly _localBounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  private _active = true;

  constructor(
    private readonly _data: HeightfieldWaterCompiledData,
    localMapTexture?: Texture,
    private readonly _planarTransform: Readonly<CompiledWaterPlanarTransformV1> = compileWaterPlanarTransform({
      position: [0, 0, 0],
      yawDegrees: 0,
      scaleXZ: [1, 1]
    })
  ) {
    this._query = new HeightfieldWaterBaseQueryService(_data, _planarTransform);
    const boundary = _data.lakeBoundary;
    if (boundary?.queryCoverage === "boundary" && this._query.available) {
      const nearShore = heightfieldNearShoreQuery(_data);
      this.nearShore = Object.freeze({
        radiusM: WATER_NEAR_SHORE_RADIUS_M,
        prepare: (now, budgetMs) => this._active && nearShore.prepare!(now, budgetMs),
        createTask: (x, z, out) => {
          const dx = x - _planarTransform.source.position[0],
            dz = z - _planarTransform.source.position[2];
          return guardWaterNearShoreTask(
            nearShore.createTask!(
              dx * _planarTransform.cosine - dz * _planarTransform.sine,
              dx * _planarTransform.sine + dz * _planarTransform.cosine,
              out
            ),
            out,
            () => this._active,
            _planarTransform.source.position[1]
          );
        },
        sample: (x, z, out) => {
          resetWaterNearShoreSample(out);
          if (!this._active || !Number.isFinite(x) || !Number.isFinite(z)) return false;
          const dx = x - _planarTransform.source.position[0],
            dz = z - _planarTransform.source.position[2];
          const localX = dx * _planarTransform.cosine - dz * _planarTransform.sine;
          const localZ = dx * _planarTransform.sine + dz * _planarTransform.cosine;
          if (!nearShore.sample(localX, localZ, out)) return false;
          out.surfaceHeight += _planarTransform.source.position[1];
          return true;
        }
      } satisfies WaterNearShoreQuery);
    }
    const grid = _data.grid;
    const halfCellX = grid.cellSizeXZ[0] * 0.5;
    const halfCellZ = grid.cellSizeXZ[1] * 0.5;
    const localBounds = {
      minimum: {
        x: grid.originXZ[0] - halfCellX,
        y: _data.stats.minSurfaceHeight,
        z: grid.originXZ[1] - halfCellZ
      },
      maximum: {
        x: grid.originXZ[0] + (grid.width - 1) * grid.cellSizeXZ[0] + halfCellX,
        y: _data.stats.maxSurfaceHeight,
        z: grid.originXZ[1] + (grid.height - 1) * grid.cellSizeXZ[1] + halfCellZ
      }
    } as const;
    this._localBounds = Object.freeze({
      minX: localBounds.minimum.x,
      minZ: localBounds.minimum.z,
      maxX: localBounds.maximum.x,
      maxZ: localBounds.maximum.z
    });
    const worldBounds = waterLocalBoundsToWorld(_planarTransform, localBounds);
    const channels =
      WaterSpatialFieldChannel.Bathymetry |
      WaterSpatialFieldChannel.ShoreSignedDistance |
      WaterSpatialFieldChannel.ShoreNormal |
      WaterSpatialFieldChannel.Current;
    this.metadata = Object.freeze({
      version: WATER_SPATIAL_FIELD_VERSION,
      sourceSchemaVersion: _data.schemaVersion,
      sourceHash: _data.sourceHash,
      compiledHash: _data.compiledHash,
      storage: this._query.available ? "heightfield-query-grid+rgba8-local-map" : "rgba8-local-map-gpu-only",
      channels,
      bounds: Object.freeze({
        minX: worldBounds.minimum.x,
        minZ: worldBounds.minimum.z,
        maxX: worldBounds.maximum.x,
        maxZ: worldBounds.maximum.z
      }),
      outsidePolicy: WATER_SPATIAL_FIELD_OUTSIDE_UNRESOLVED,
      maximumHorizontalError: this._query.available ? Math.hypot(grid.cellSizeXZ[0], grid.cellSizeXZ[1]) * 0.5 : 0,
      maximumDepthError: 0
    });
    if (localMapTexture) {
      const atlas = _data.localMapAtlas;
      const source = _planarTransform.source;
      const scaleX = atlas.worldToUv[0];
      const scaleZ = atlas.worldToUv[1];
      const cosine = _planarTransform.cosine;
      const sine = _planarTransform.sine;
      const axisAligned = Math.abs(sine) <= 1e-12;
      const affine = Object.freeze([
        scaleX * cosine,
        axisAligned ? 0 : -scaleX * sine,
        atlas.worldToUv[2] - source.position[0] * scaleX * cosine + source.position[2] * scaleX * sine,
        axisAligned ? 0 : scaleZ * sine,
        scaleZ * cosine,
        atlas.worldToUv[3] - source.position[0] * scaleZ * sine - source.position[2] * scaleZ * cosine
      ] as const);
      this._gpuBinding = Object.freeze({
        version: WATER_SPATIAL_FIELD_VERSION,
        sourceHash: this.metadata.sourceHash,
        compiledHash: this.metadata.compiledHash,
        texture: localMapTexture,
        worldToUv: axisAligned ? Object.freeze([affine[0], affine[4], affine[2], affine[5]] as const) : undefined,
        worldToUvAffine: affine,
        channels,
        decode: Object.freeze({
          flow: atlas.flowDecodeScale,
          depth: atlas.maxDepth,
          shoreSignedDistance: atlas.signedDistanceRange
        }),
        maximumDepthDecodeError: atlas.maxDepth / 510,
        maximumShoreDecodeError: atlas.signedDistanceRange / 255
      });
    }
  }

  get gpuBinding(): WaterSpatialFieldGpuBinding | undefined {
    return this._active ? this._gpuBinding : undefined;
  }

  capture() {
    if (!this._active) throw new Error("Heightfield Spatial Field has been retired.");
    return waterSpatialFieldSnapshot(
      new HeightfieldWaterSpatialFieldProvider(this._data, undefined, this._planarTransform)
    );
  }

  sampleSpatialField(worldX: number, worldZ: number, outSample: WaterSpatialFieldSample): boolean {
    resetWaterSpatialFieldSample(outSample);
    if (!this._active) {
      outSample.region = WaterSpatialFieldRegion.OutsideUnresolved;
      return false;
    }
    if (!this._query.available) {
      outSample.region = WaterSpatialFieldRegion.OutsideUnresolved;
      return false;
    }
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
    const bounds = this.metadata.bounds;
    if (worldX < bounds.minX || worldX > bounds.maxX || worldZ < bounds.minZ || worldZ > bounds.maxZ) {
      outSample.region = WaterSpatialFieldRegion.OutsideUnresolved;
      return false;
    }

    const transform = this._planarTransform;
    const deltaX = worldX - transform.source.position[0];
    const deltaZ = worldZ - transform.source.position[2];
    const localX = deltaX * transform.cosine - deltaZ * transform.sine;
    const localZ = deltaX * transform.sine + deltaZ * transform.cosine;
    const localBounds = this._localBounds;
    if (
      localX < localBounds.minX ||
      localX > localBounds.maxX ||
      localZ < localBounds.minZ ||
      localZ > localBounds.maxZ
    ) {
      outSample.region = WaterSpatialFieldRegion.OutsideUnresolved;
      return false;
    }
    const center = this._query.sampleBaseSurfaceLocal(localX, localZ, this._center);
    outSample.resolved = true;
    outSample.insideField = true;
    outSample.wet = center.inside;
    outSample.validChannels =
      WaterSpatialFieldChannel.ShoreSignedDistance |
      WaterSpatialFieldChannel.ShoreNormal |
      WaterSpatialFieldChannel.Current |
      (center.inside ? WaterSpatialFieldChannel.Bathymetry : WaterSpatialFieldChannel.None);
    outSample.region = center.inside ? WaterSpatialFieldRegion.InsideWet : WaterSpatialFieldRegion.InsideDry;
    outSample.surfaceHeight = Number.isFinite(center.surfaceHeight)
      ? center.surfaceHeight + transform.source.position[1]
      : center.surfaceHeight;
    outSample.waterDepth = center.depth;
    outSample.bedHeight = center.inside
      ? center.surfaceHeight + transform.source.position[1] - center.depth
      : Number.NaN;
    outSample.shoreSignedDistance = center.signedShoreDistance;
    outSample.currentX = center.flowVectorXZ[0] * transform.cosine + center.flowVectorXZ[1] * transform.sine;
    outSample.currentZ = -center.flowVectorXZ[0] * transform.sine + center.flowVectorXZ[1] * transform.cosine;
    this._sampleShoreNormal(localX, localZ, outSample);
    return true;
  }

  destroy(): void {
    this._active = false;
  }

  maximumSurfaceHeightInBounds(bounds: WaterBoundsXZ): number | null {
    assertWaterQueryBounds(bounds);
    if (!this._active || !this._data.queryGrid) throw new Error("Heightfield static bounds query is unavailable.");
    const t = this._planarTransform;
    const points = [bounds.minX, bounds.maxX].flatMap((x) =>
      [bounds.minZ, bounds.maxZ].map((z) => {
        const dx = x - t.source.position[0],
          dz = z - t.source.position[2];
        return [dx * t.cosine - dz * t.sine, dx * t.sine + dz * t.cosine];
      })
    );
    const local = {
      minX: Math.max(this._localBounds.minX, Math.min(...points.map((p) => p[0]))),
      maxX: Math.min(this._localBounds.maxX, Math.max(...points.map((p) => p[0]))),
      minZ: Math.max(this._localBounds.minZ, Math.min(...points.map((p) => p[1]))),
      maxZ: Math.min(this._localBounds.maxZ, Math.max(...points.map((p) => p[1])))
    };
    if (local.minX > local.maxX || local.minZ > local.maxZ) return null;
    const boundary = this._data.lakeBoundary;
    if (boundary?.queryCoverage === "boundary") {
      const tolerance = boundary.terrainShorelineTolerance ?? 0;
      const expanded = {
        minX: local.minX - tolerance,
        maxX: local.maxX + tolerance,
        minZ: local.minZ - tolerance,
        maxZ: local.maxZ + tolerance
      };
      if (!boundary.rings.some((ring) => polygonWaterBoundsOverlap(ring, expanded))) return null;
    }
    const q = this._data.queryGrid,
      g = q.grid;
    const x0 = Math.max(0, Math.floor((local.minX - g.originXZ[0]) / g.cellSizeXZ[0] + 0.5));
    const x1 = Math.min(g.width - 1, Math.floor((local.maxX - g.originXZ[0]) / g.cellSizeXZ[0] + 0.5));
    const z0 = Math.max(0, Math.floor((local.minZ - g.originXZ[1]) / g.cellSizeXZ[1] + 0.5));
    const z1 = Math.min(g.height - 1, Math.floor((local.maxZ - g.originXZ[1]) / g.cellSizeXZ[1] + 0.5));
    let maximum = -Infinity;
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const i = z * g.width + x;
        if (!q.wetMask.at(i)) continue;
        const component = q.componentIndices.at(i);
        // Component-normalized bilinear interpolation is a convex combination of matching neighbours.
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= g.width || nz >= g.height) continue;
            const neighbour = nz * g.width + nx;
            if (q.wetMask.at(neighbour) && q.componentIndices.at(neighbour) === component)
              maximum = Math.max(maximum, q.surfaceHeights.at(neighbour)!);
          }
      }
    return maximum === -Infinity ? null : maximum + t.source.position[1];
  }

  private _sampleShoreNormal(localX: number, localZ: number, outSample: WaterSpatialFieldSample): void {
    const stepX = this._data.grid.cellSizeXZ[0];
    const stepZ = this._data.grid.cellSizeXZ[1];
    const negativeX = this._query.sampleBaseSurfaceLocal(localX - stepX, localZ, this._negativeX).signedShoreDistance;
    const positiveX = this._query.sampleBaseSurfaceLocal(localX + stepX, localZ, this._positiveX).signedShoreDistance;
    const negativeZ = this._query.sampleBaseSurfaceLocal(localX, localZ - stepZ, this._negativeZ).signedShoreDistance;
    const positiveZ = this._query.sampleBaseSurfaceLocal(localX, localZ + stepZ, this._positiveZ).signedShoreDistance;
    const gradientX =
      Number.isFinite(negativeX) && Number.isFinite(positiveX) ? (positiveX - negativeX) / (stepX * 2) : 0;
    const gradientZ =
      Number.isFinite(negativeZ) && Number.isFinite(positiveZ) ? (positiveZ - negativeZ) / (stepZ * 2) : 0;
    const length = Math.hypot(gradientX, gradientZ);
    if (length <= 1e-8) return;
    // SDF is positive in water, so its negative gradient points toward dry land.
    const localNormalX = -gradientX / length;
    const localNormalZ = -gradientZ / length;
    outSample.shoreNormalX = localNormalX * this._planarTransform.cosine + localNormalZ * this._planarTransform.sine;
    outSample.shoreNormalZ = -localNormalX * this._planarTransform.sine + localNormalZ * this._planarTransform.cosine;
  }
}
