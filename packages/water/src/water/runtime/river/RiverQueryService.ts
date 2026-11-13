import { sampleWaterConnection, sampleWaterConnectionShore } from "../../authoring/connections/WaterConnection";
import { insideRiverDropFootprint } from "../../authoring/river/RiverDrop";
import {
  clamp01,
  distanceToPolygonBankXZ,
  findGeometryTriangleXZ,
  findReachSpanGeometryTriangleXZ,
  isPointInsidePolygonXZ,
  maximumGeometryHeightInBounds,
  type RiverTriangleSample
} from "./RiverQueryGeometry";
/**
 * Runtime water queries for the river prototype.
 *
 * Rendering a river mesh is not enough for an engine-level water system; gameplay
 * code also needs to ask whether a world position is in water, how deep it is, what
 * direction the flow moves, and how far the point is from the bank. This file keeps
 * that render-independent query logic beside the sampled river path so actors,
 * particles, audio, physics, or AI systems can consume river data without reading
 * mesh vertices or material state directly.
 */
import { Vector3 } from "@galacean/engine-math";
import { sampleWaterTerrainHeight } from "../../authoring/terrain/WaterTerrainSnapshot";
import { RIVER_QUERY_SAMPLE_COMPONENT } from "../../compiler/river/constants";
import { RiverChunkSourceKind, RiverQueryPrimitiveKind } from "../../compiler/river/RiverGeometryEnums";
import {
  createRiverSurfaceDomainOffsets,
  createRiverSurfaceMotionSampleOutput,
  evaluateRiverSurfaceMotion
} from "../../compiler/river/RiverSurfaceMotion";
import type { RiverCompiledData, RiverGeometryData } from "../../compiler/river/types";
import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";
import { assertWaterQueryBounds } from "../spatial/WaterBoundsQuery";
import { RIVER_QUERY_EPSILON, RIVER_QUERY_NO_SOURCE_INDEX, RIVER_QUERY_NO_SOURCE_KIND } from "./constants";
import { createRiverLocalCurrentSample, RiverLocalCurrentSampler } from "./RiverLocalCurrentSampler";
import { riverNearShoreQuery } from "./RiverNearShoreQuery";
import type { RiverNetworkQueryBatchOutput, RiverNetworkQueryResult } from "./types";

function interpolateSampleValue(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createRiverNetworkQueryResult(): RiverNetworkQueryResult {
  return {
    hit: false,
    waterBodyId: "",
    segmentId: "",
    sourceKind: undefined,
    sourceIndex: RIVER_QUERY_NO_SOURCE_INDEX,
    insideFootprint: false,
    insideVolume: false,
    surfaceHeight: 0,
    surfaceVerticalVelocity: 0,
    signedSurfaceDistance: 0,
    submergedDepth: 0,
    waterDepth: 0,
    distanceToBank: Number.NEGATIVE_INFINITY,
    baseFlowVector: new Vector3(),
    localFlowVector: new Vector3(),
    localFlowWeight: 0,
    flowVector: new Vector3(),
    surfaceNormal: new Vector3(0, 1, 0)
  };
}

export function createRiverNetworkQueryBatchOutput(capacity: number): RiverNetworkQueryBatchOutput {
  const sourceKinds = new Uint8Array(capacity);
  sourceKinds.fill(RIVER_QUERY_NO_SOURCE_KIND);
  const sourceIndices = new Int32Array(capacity);
  sourceIndices.fill(RIVER_QUERY_NO_SOURCE_INDEX);
  return {
    hits: new Uint8Array(capacity),
    sourceKinds,
    sourceIndices,
    insideFootprints: new Uint8Array(capacity),
    insideVolumes: new Uint8Array(capacity),
    surfaceHeights: new Float32Array(capacity),
    surfaceVerticalVelocities: new Float32Array(capacity),
    signedSurfaceDistances: new Float32Array(capacity),
    submergedDepths: new Float32Array(capacity),
    waterDepths: new Float32Array(capacity),
    distancesToBank: new Float32Array(capacity),
    flowVectors: new Float32Array(capacity * 3),
    surfaceNormals: new Float32Array(capacity * 3)
  };
}

function resetNetworkResult(result: RiverNetworkQueryResult, waterBodyId: string): void {
  result.hit = false;
  result.waterBodyId = waterBodyId;
  result.segmentId = "";
  result.sourceKind = undefined;
  result.sourceIndex = RIVER_QUERY_NO_SOURCE_INDEX;
  result.insideFootprint = false;
  result.insideVolume = false;
  result.surfaceHeight = 0;
  result.surfaceVerticalVelocity = 0;
  result.signedSurfaceDistance = 0;
  result.submergedDepth = 0;
  result.waterDepth = 0;
  result.distanceToBank = Number.NEGATIVE_INFINITY;
  result.baseFlowVector.set(0, 0, 0);
  result.localFlowVector.set(0, 0, 0);
  result.localFlowWeight = 0;
  result.flowVector.set(0, 0, 0);
  result.surfaceNormal.set(0, 1, 0);
}

/** Runtime facade over compiler-owned query data. Constructor allocations are amortized at activation. */
export class RiverNetworkQueryService {
  private readonly _primitiveKinds: Uint32Array;
  private readonly _primitiveSourceIndices: Uint32Array;
  private readonly _primitiveLocalIndices: Uint32Array;
  private readonly _primitiveBounds: Float32Array;
  private readonly _cellCoordinates: Int32Array;
  private readonly _cellOffsets: Uint32Array;
  private readonly _cellPrimitiveIndices: Uint32Array;
  private readonly _reachSamples: readonly Float32Array[];
  private readonly _reachSampleStrides: Uint32Array;
  private readonly _junctionBoundaries: readonly Float32Array[];
  private readonly _junctionInradii: Float32Array;
  private readonly _localCurrentSampler?: RiverLocalCurrentSampler;
  private readonly _localCurrentScratch = createRiverLocalCurrentSample();
  private _localCurrentEnabled = true;
  private readonly _batchScratch = createRiverNetworkQueryResult();
  private readonly _motionScratch = createRiverSurfaceMotionSampleOutput();
  private readonly _motionDomainOffsets = createRiverSurfaceDomainOffsets();
  private readonly _motionCoordinates = {
    signedAcrossDistance: 0,
    networkFlowTime: 0,
    halfWidth: 0,
    flowSpeed: 0
  };
  private readonly _geometryTriangleScratch: RiverTriangleSample = {
    firstIndex: 0,
    secondIndex: 0,
    thirdIndex: 0,
    firstWeight: 0,
    secondWeight: 0,
    thirdWeight: 0
  };
  private _selectedGeometryTriangle = false;
  private _vertexSampleCache?: RiverVertexSampleCache;

  constructor(private readonly _data: RiverCompiledData) {
    const index = _data.queryIndex;
    this._primitiveKinds = index.primitiveKinds.borrowTypedArray();
    this._primitiveSourceIndices = index.primitiveSourceIndices.borrowTypedArray();
    this._primitiveLocalIndices = index.primitiveLocalIndices.borrowTypedArray();
    this._primitiveBounds = index.primitiveBounds.borrowTypedArray();
    this._cellCoordinates = index.cellCoordinates.borrowTypedArray();
    this._cellOffsets = index.cellOffsets.borrowTypedArray();
    this._cellPrimitiveIndices = index.cellPrimitiveIndices.borrowTypedArray();
    const localMapAtlas = _data.terrainInteraction.localMapAtlas;
    this._localCurrentSampler = localMapAtlas ? new RiverLocalCurrentSampler(localMapAtlas) : undefined;
    this._reachSamples = _data.reaches.map((reach) => reach.artifact.querySource.samples.borrowTypedArray());
    this._reachSampleStrides = new Uint32Array(_data.reaches.map((reach) => reach.artifact.querySource.stride));
    this._junctionBoundaries = _data.junctions.map((junction) => {
      const buffer = new Float32Array(junction.queryBoundary.length * 3);
      for (let index = 0; index < junction.queryBoundary.length; index++) {
        const position = junction.queryBoundary[index];
        buffer[index * 3] = position[0];
        buffer[index * 3 + 1] = position[1];
        buffer[index * 3 + 2] = position[2];
      }
      return buffer;
    });
    this._junctionInradii = new Float32Array(_data.junctions.length);
    for (let index = 0; index < _data.junctions.length; index++) {
      const junction = _data.junctions[index];
      this._junctionInradii[index] = Math.max(
        RIVER_QUERY_EPSILON,
        distanceToPolygonBankXZ(this._junctionBoundaries[index], junction.position[0], junction.position[2])
      );
    }
  }

  get localCurrentSampleCount(): number {
    return this._localCurrentSampler?.sampleCount ?? 0;
  }

  get localCurrentAppliedCount(): number {
    return this._localCurrentSampler?.appliedCount ?? 0;
  }

  get localCurrentEnabled(): boolean {
    return this._localCurrentEnabled;
  }

  setLocalCurrentEnabled(enabled: boolean): void {
    this._localCurrentEnabled = enabled;
  }

  /** New scratch state over the same immutable compiler facts; no runtime clock or GPU owner. */
  capture(): RiverNetworkQueryService {
    const query = new RiverNetworkQueryService(this._data);
    query.setLocalCurrentEnabled(this._localCurrentEnabled);
    return query;
  }

  /** Shared lazy BVH over this exact immutable compile, independent of the live query scratch/clock. */
  get nearShore() {
    return riverNearShoreQuery(this._data, () => {
      const query = new RiverNetworkQueryService(this._data),
        point = new Vector3(),
        result = createRiverNetworkQueryResult();
      return (x, z) => {
        point.set(x, 0, z);
        query.sampleSurface(point, result);
        return result.insideFootprint && result.waterDepth > 0 ? result.surfaceHeight : undefined;
      };
    });
  }

  /** Conservative bound for static and animated triangle queries, before terrain/cut rejection. */
  maximumSurfaceHeightInBounds(bounds: WaterBoundsXZ): number | null {
    assertWaterQueryBounds(bounds);
    let maximum = -Infinity;
    const displacement = Math.max(0, this._data.surfaceMotion.maxDisplacement);
    for (let i = 0; i < this._primitiveKinds.length; i++) {
      const offset = i * 4;
      if (
        bounds.maxX < this._primitiveBounds[offset] - RIVER_QUERY_EPSILON ||
        bounds.maxZ < this._primitiveBounds[offset + 1] - RIVER_QUERY_EPSILON ||
        bounds.minX > this._primitiveBounds[offset + 2] + RIVER_QUERY_EPSILON ||
        bounds.minZ > this._primitiveBounds[offset + 3] + RIVER_QUERY_EPSILON
      )
        continue;
      const source = this._primitiveSourceIndices[i];
      if (this._primitiveKinds[i] === RiverQueryPrimitiveKind.Junction) {
        maximum = Math.max(
          maximum,
          maximumGeometryHeightInBounds(this._data.junctions[source].surfaceGeometry, bounds, displacement)
        );
      } else {
        const { surfaceGeometry: geometry, querySource } = this._data.reaches[source].artifact;
        if (querySource.sampleCount < 2 || geometry.positions.length % querySource.sampleCount !== 0) continue;
        const rowWidth = geometry.positions.length / querySource.sampleCount;
        const spanIndexCount = Math.max(0, rowWidth - 1) * 6;
        const start = geometry.drawStart + this._primitiveLocalIndices[i] * spanIndexCount;
        const end = Math.min(start + spanIndexCount, geometry.drawStart + geometry.drawCount);
        maximum = Math.max(maximum, maximumGeometryHeightInBounds(geometry, bounds, displacement, start, end));
      }
    }
    return maximum === -Infinity ? null : maximum;
  }

  sampleSurface(worldPosition: Vector3, outResult: RiverNetworkQueryResult): boolean {
    return this._sample(worldPosition.x, worldPosition.y, worldPosition.z, outResult, true);
  }

  sampleSurfaceAtTime(worldPosition: Vector3, elapsedTime: number, outResult: RiverNetworkQueryResult): boolean {
    return this._sample(worldPosition.x, worldPosition.y, worldPosition.z, outResult, true, Math.max(0, elapsedTime));
  }

  containsVolume(worldPosition: Vector3, outResult: RiverNetworkQueryResult): boolean {
    this.sampleSurface(worldPosition, outResult);
    return outResult.insideVolume;
  }

  /** Diagnostic reference path used to verify the compiled index. */
  sampleSurfaceBruteForce(worldPosition: Vector3, outResult: RiverNetworkQueryResult): boolean {
    return this._sample(worldPosition.x, worldPosition.y, worldPosition.z, outResult, false);
  }

  queryBatch(positions: Float32Array, out: RiverNetworkQueryBatchOutput): number {
    return this._queryBatch(positions, out);
  }

  queryBatchAtTime(positions: Float32Array, elapsedTime: number, out: RiverNetworkQueryBatchOutput): number {
    return this._queryBatch(positions, out, Math.max(0, elapsedTime));
  }

  private _queryBatch(positions: Float32Array, out: RiverNetworkQueryBatchOutput, elapsedTime?: number): number {
    const count = Math.floor(positions.length / 3);
    if (!this._hasBatchCapacity(out, count)) {
      throw new RangeError("River query batch output capacity is smaller than the position count.");
    }
    for (let index = 0; index < count; index++) {
      const offset = index * 3;
      const result = this._batchScratch;
      this._sample(positions[offset], positions[offset + 1], positions[offset + 2], result, true, elapsedTime);
      out.hits[index] = result.hit ? 1 : 0;
      out.sourceKinds[index] = result.hit
        ? result.sourceKind === RiverChunkSourceKind.Junction
          ? RiverQueryPrimitiveKind.Junction
          : RiverQueryPrimitiveKind.ReachSpan
        : RIVER_QUERY_NO_SOURCE_KIND;
      out.sourceIndices[index] = result.sourceIndex;
      out.insideFootprints[index] = result.insideFootprint ? 1 : 0;
      out.insideVolumes[index] = result.insideVolume ? 1 : 0;
      out.surfaceHeights[index] = result.surfaceHeight;
      out.surfaceVerticalVelocities[index] = result.surfaceVerticalVelocity;
      out.signedSurfaceDistances[index] = result.signedSurfaceDistance;
      out.submergedDepths[index] = result.submergedDepth;
      out.waterDepths[index] = result.waterDepth;
      out.distancesToBank[index] = result.distanceToBank;
      out.flowVectors[offset] = result.flowVector.x;
      out.flowVectors[offset + 1] = result.flowVector.y;
      out.flowVectors[offset + 2] = result.flowVector.z;
      out.surfaceNormals[offset] = result.surfaceNormal.x;
      out.surfaceNormals[offset + 1] = result.surfaceNormal.y;
      out.surfaceNormals[offset + 2] = result.surfaceNormal.z;
    }
    return count;
  }

  private _hasBatchCapacity(out: RiverNetworkQueryBatchOutput, count: number): boolean {
    return (
      out.hits.length >= count &&
      out.sourceKinds.length >= count &&
      out.sourceIndices.length >= count &&
      out.insideFootprints.length >= count &&
      out.insideVolumes.length >= count &&
      out.surfaceHeights.length >= count &&
      out.surfaceVerticalVelocities.length >= count &&
      out.signedSurfaceDistances.length >= count &&
      out.submergedDepths.length >= count &&
      out.waterDepths.length >= count &&
      out.distancesToBank.length >= count &&
      out.flowVectors.length >= count * 3 &&
      out.surfaceNormals.length >= count * 3
    );
  }

  private _sample(
    x: number,
    y: number,
    z: number,
    outResult: RiverNetworkQueryResult,
    useIndex: boolean,
    elapsedTime?: number
  ): boolean {
    resetNetworkResult(outResult, this._data.sourceId);
    if (this._data.drops?.some((drop) => insideRiverDropFootprint(drop, x, z))) return false;
    if (!sampleWaterConnection(this._data.connections, x, z).covered) return false;
    this._selectedGeometryTriangle = false;
    let bestDistanceToBank = Number.NEGATIVE_INFINITY;
    if (useIndex) {
      const cellX = Math.floor(x / this._data.queryIndex.cellSize);
      const cellZ = Math.floor(z / this._data.queryIndex.cellSize);
      const cellIndex = this._findCell(cellX, cellZ);
      if (cellIndex < 0) return false;
      const start = this._cellOffsets[cellIndex];
      const end = this._cellOffsets[cellIndex + 1];
      for (let offset = start; offset < end; offset++) {
        bestDistanceToBank = this._samplePrimitive(
          this._cellPrimitiveIndices[offset],
          x,
          y,
          z,
          bestDistanceToBank,
          outResult,
          elapsedTime
        );
      }
    } else {
      for (let primitiveIndex = 0; primitiveIndex < this._primitiveKinds.length; primitiveIndex++) {
        bestDistanceToBank = this._samplePrimitive(primitiveIndex, x, y, z, bestDistanceToBank, outResult, elapsedTime);
      }
    }
    if (outResult.hit && this._data.terrain) {
      const bedHeight = sampleWaterTerrainHeight(this._data.terrain, x, z);
      if (bedHeight === undefined) {
        resetNetworkResult(outResult, this._data.sourceId);
        return false;
      }
      outResult.waterDepth = Math.max(0, outResult.surfaceHeight - bedHeight);
      outResult.insideFootprint = outResult.insideFootprint && outResult.waterDepth > 0;
      outResult.insideVolume =
        outResult.insideFootprint &&
        y >= bedHeight - RIVER_QUERY_EPSILON &&
        y <= outResult.surfaceHeight + RIVER_QUERY_EPSILON;
      outResult.submergedDepth = outResult.insideFootprint
        ? Math.min(outResult.waterDepth, Math.max(0, outResult.surfaceHeight - y))
        : 0;
    }
    if (outResult.insideFootprint)
      outResult.distanceToBank = sampleWaterConnectionShore(this._data.connections, x, z, outResult.distanceToBank);
    return outResult.hit;
  }

  private _findCell(cellX: number, cellZ: number): number {
    let low = 0;
    let high = this._data.queryIndex.cellCount - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const x = this._cellCoordinates[middle * 2];
      const z = this._cellCoordinates[middle * 2 + 1];
      if (x === cellX && z === cellZ) return middle;
      if (x < cellX || (x === cellX && z < cellZ)) low = middle + 1;
      else high = middle - 1;
    }
    return RIVER_QUERY_NO_SOURCE_INDEX;
  }

  private _samplePrimitive(
    primitiveIndex: number,
    x: number,
    y: number,
    z: number,
    bestDistanceToBank: number,
    outResult: RiverNetworkQueryResult,
    elapsedTime?: number
  ): number {
    const boundsOffset = primitiveIndex * 4;
    if (
      x < this._primitiveBounds[boundsOffset] - RIVER_QUERY_EPSILON ||
      z < this._primitiveBounds[boundsOffset + 1] - RIVER_QUERY_EPSILON ||
      x > this._primitiveBounds[boundsOffset + 2] + RIVER_QUERY_EPSILON ||
      z > this._primitiveBounds[boundsOffset + 3] + RIVER_QUERY_EPSILON
    ) {
      return bestDistanceToBank;
    }
    return this._primitiveKinds[primitiveIndex] === RiverQueryPrimitiveKind.Junction
      ? this._sampleJunction(primitiveIndex, x, y, z, bestDistanceToBank, outResult, elapsedTime)
      : this._sampleReachSpan(primitiveIndex, x, y, z, bestDistanceToBank, outResult, elapsedTime);
  }

  private _taperConnectionMotion(x: number, z: number): void {
    if (!this._data.connections) return;
    const weight = sampleWaterConnection(this._data.connections, x, z).motion;
    this._motionScratch.height *= weight;
    this._motionScratch.verticalVelocity *= weight;
    this._motionScratch.acrossDerivative *= weight;
    this._motionScratch.downstreamDerivative *= weight;
  }

  private _sampleReachSpan(
    primitiveIndex: number,
    x: number,
    y: number,
    z: number,
    bestDistanceToBank: number,
    outResult: RiverNetworkQueryResult,
    elapsedTime?: number
  ): number {
    const reachIndex = this._primitiveSourceIndices[primitiveIndex];
    const spanIndex = this._primitiveLocalIndices[primitiveIndex];
    const reach = this._data.reaches[reachIndex];
    const geometry = reach.artifact.surfaceGeometry;
    if (
      !findReachSpanGeometryTriangleXZ(
        geometry,
        reach.artifact.querySource.sampleCount,
        spanIndex,
        x,
        z,
        this._geometryTriangleScratch
      )
    )
      return bestDistanceToBank;
    const samples = this._reachSamples[reachIndex];
    const stride = this._reachSampleStrides[reachIndex];
    const aOffset = spanIndex * stride;
    const bOffset = aOffset + stride;
    const ax = samples[aOffset + RIVER_QUERY_SAMPLE_COMPONENT.x];
    const az = samples[aOffset + RIVER_QUERY_SAMPLE_COMPONENT.z];
    const bx = samples[bOffset + RIVER_QUERY_SAMPLE_COMPONENT.x];
    const bz = samples[bOffset + RIVER_QUERY_SAMPLE_COMPONENT.z];
    const abx = bx - ax;
    const abz = bz - az;
    const horizontalLengthSquared = abx * abx + abz * abz;
    const t =
      horizontalLengthSquared > RIVER_QUERY_EPSILON
        ? clamp01(((x - ax) * abx + (z - az) * abz) / horizontalLengthSquared)
        : 0;
    const centerDistance = Math.hypot(x - (ax + abx * t), z - (az + abz * t));
    const halfWidth =
      interpolateSampleValue(
        samples[aOffset + RIVER_QUERY_SAMPLE_COMPONENT.width],
        samples[bOffset + RIVER_QUERY_SAMPLE_COMPONENT.width],
        t
      ) * 0.5;
    const distanceToBank = halfWidth - centerDistance;
    const profileDepth = interpolateSampleValue(
      samples[aOffset + RIVER_QUERY_SAMPLE_COMPONENT.depth],
      samples[bOffset + RIVER_QUERY_SAMPLE_COMPONENT.depth],
      t
    );
    const waterDepth = Math.max(0, profileDepth * clamp01(distanceToBank / Math.max(halfWidth, RIVER_QUERY_EPSILON)));
    return this._sampleTriangleGeometry(
      geometry,
      RiverChunkSourceKind.Reach,
      reachIndex,
      reach.id,
      x,
      y,
      z,
      distanceToBank,
      waterDepth,
      bestDistanceToBank,
      outResult,
      elapsedTime
    );
  }

  private _sampleJunction(
    primitiveIndex: number,
    x: number,
    y: number,
    z: number,
    bestDistanceToBank: number,
    outResult: RiverNetworkQueryResult,
    elapsedTime?: number
  ): number {
    const junctionIndex = this._primitiveSourceIndices[primitiveIndex];
    const junction = this._data.junctions[junctionIndex];
    const geometry = junction.surfaceGeometry;
    if (!findGeometryTriangleXZ(geometry, x, z, this._geometryTriangleScratch)) return bestDistanceToBank;
    const boundary = this._junctionBoundaries[junctionIndex];
    const bankDistance = distanceToPolygonBankXZ(boundary, x, z);
    const distanceToBank = isPointInsidePolygonXZ(boundary, x, z) ? bankDistance : -bankDistance;
    const waterDepth =
      distanceToBank >= 0 ? junction.depth * clamp01(distanceToBank / this._junctionInradii[junctionIndex]) : 0;
    return this._sampleTriangleGeometry(
      geometry,
      RiverChunkSourceKind.Junction,
      junctionIndex,
      junction.id,
      x,
      y,
      z,
      distanceToBank,
      waterDepth,
      bestDistanceToBank,
      outResult,
      elapsedTime
    );
  }

  /** Static queries use the same vertex interpolation with a zero-amplitude motion profile. */
  private _sampleTriangleGeometry(
    geometry: RiverGeometryData,
    sourceKind: RiverChunkSourceKind,
    sourceIndex: number,
    segmentId: string,
    x: number,
    y: number,
    z: number,
    distanceToBank: number,
    waterDepth: number,
    bestDistanceToBank: number,
    outResult: RiverNetworkQueryResult,
    elapsedTime?: number
  ): number {
    const { uv2s, uv3s, tangents, normals } = geometry;
    if (!uv2s || !uv3s || !tangents || !normals) return bestDistanceToBank;
    const triangle = this._geometryTriangleScratch;
    const cache = (this._vertexSampleCache ??= new RiverVertexSampleCache());
    const values = cache.values;
    let surfaceHeight = 0,
      surfaceVerticalVelocity = 0;
    let normalX = 0,
      normalY = 0,
      normalZ = 0,
      flowX = 0,
      flowZ = 0;
    for (let vertex = 0; vertex < 3; vertex++) {
      const vertexIndex =
        vertex === 0 ? triangle.firstIndex : vertex === 1 ? triangle.secondIndex : triangle.thirdIndex;
      const weight = vertex === 0 ? triangle.firstWeight : vertex === 1 ? triangle.secondWeight : triangle.thirdWeight;
      const slot = cache.sample(geometry, vertexIndex);
      const tangentX = values[slot];
      const tangentZ = values[slot + 1];
      const lateralX = -tangentZ;
      const lateralZ = tangentX;
      this._motionCoordinates.signedAcrossDistance = uv2s[vertexIndex][0];
      this._motionCoordinates.networkFlowTime = uv2s[vertexIndex][1];
      this._motionCoordinates.halfWidth = uv3s[vertexIndex][0];
      this._motionCoordinates.flowSpeed = geometry.uv1s[vertexIndex][0];
      if (elapsedTime === undefined) {
        // The static profile has zero amplitude: no temporal field or connection
        // taper can contribute. Retain the same triangle interpolation below.
        this._motionScratch.height = 0;
        this._motionScratch.verticalVelocity = 0;
        this._motionScratch.acrossDerivative = 0;
        this._motionScratch.downstreamDerivative = 0;
      } else {
        evaluateRiverSurfaceMotion(
          this._data.surfaceMotion,
          this._motionCoordinates,
          elapsedTime,
          this._motionScratch,
          this._motionDomainOffsets
        );
        this._taperConnectionMotion(geometry.positions[vertexIndex][0], geometry.positions[vertexIndex][2]);
      }
      surfaceHeight += (geometry.positions[vertexIndex][1] + this._motionScratch.height) * weight;
      surfaceVerticalVelocity += this._motionScratch.verticalVelocity * weight;
      if (elapsedTime === undefined) {
        normalX += values[slot + 3] * weight;
        normalY += values[slot + 4] * weight;
        normalZ += values[slot + 5] * weight;
      } else {
        const gradient = geometry.motionGradients?.[vertexIndex];
        const inverseNormalY = values[slot + 2];
        const vertexNormalX =
          normals[vertexIndex][0] * inverseNormalY -
          (gradient?.[0] ?? lateralX) * this._motionScratch.acrossDerivative -
          (gradient?.[2] ?? tangentX) * this._motionScratch.downstreamDerivative;
        const vertexNormalY = 1;
        const vertexNormalZ =
          normals[vertexIndex][2] * inverseNormalY -
          (gradient?.[1] ?? lateralZ) * this._motionScratch.acrossDerivative -
          (gradient?.[3] ?? tangentZ) * this._motionScratch.downstreamDerivative;
        const vertexNormalLength = Math.hypot(vertexNormalX, vertexNormalY, vertexNormalZ) || 1;
        normalX += (vertexNormalX / vertexNormalLength) * weight;
        normalY += (vertexNormalY / vertexNormalLength) * weight;
        normalZ += (vertexNormalZ / vertexNormalLength) * weight;
      }
      flowX += values[slot + 6] * weight;
      flowZ += values[slot + 7] * weight;
    }
    if (elapsedTime === undefined) {
      const first = geometry.positions[triangle.firstIndex][1];
      surfaceHeight =
        first +
        (geometry.positions[triangle.secondIndex][1] - first) * triangle.secondWeight +
        (geometry.positions[triangle.thirdIndex][1] - first) * triangle.thirdWeight;
    }
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
    normalX /= normalLength;
    normalY /= normalLength;
    normalZ /= normalLength;
    if (
      this._selectedGeometryTriangle &&
      (surfaceHeight < outResult.surfaceHeight - RIVER_QUERY_EPSILON ||
        (Math.abs(surfaceHeight - outResult.surfaceHeight) <= RIVER_QUERY_EPSILON &&
          distanceToBank <= bestDistanceToBank))
    )
      return bestDistanceToBank;
    this._selectedGeometryTriangle = true;
    this._writeResult(
      outResult,
      sourceKind,
      sourceIndex,
      segmentId,
      distanceToBank,
      surfaceHeight,
      surfaceVerticalVelocity,
      waterDepth,
      x,
      y,
      z,
      flowX,
      0,
      flowZ,
      normalX,
      normalY,
      normalZ
    );
    return distanceToBank;
  }

  private _writeResult(
    result: RiverNetworkQueryResult,
    sourceKind: RiverChunkSourceKind,
    sourceIndex: number,
    segmentId: string,
    distanceToBank: number,
    surfaceHeight: number,
    surfaceVerticalVelocity: number,
    waterDepth: number,
    queryX: number,
    queryY: number,
    queryZ: number,
    flowX: number,
    flowY: number,
    flowZ: number,
    normalX: number,
    normalY: number,
    normalZ: number
  ): void {
    // Every accepted query passed the native triangle test, including flat end cuts.
    // The centerline-distance approximation can still be negative at a valid miter corner.
    const insideFootprint = true;
    const signedSurfaceDistance = queryY - surfaceHeight;
    result.hit = true;
    result.segmentId = segmentId;
    result.sourceKind = sourceKind;
    result.sourceIndex = sourceIndex;
    result.insideFootprint = insideFootprint;
    result.surfaceHeight = surfaceHeight;
    result.surfaceVerticalVelocity = surfaceVerticalVelocity;
    result.signedSurfaceDistance = signedSurfaceDistance;
    result.waterDepth = waterDepth;
    result.insideVolume =
      insideFootprint &&
      signedSurfaceDistance <= RIVER_QUERY_EPSILON &&
      signedSurfaceDistance >= -waterDepth - RIVER_QUERY_EPSILON;
    result.submergedDepth = insideFootprint ? Math.min(waterDepth, Math.max(0, -signedSurfaceDistance)) : 0;
    result.distanceToBank = distanceToBank;
    result.baseFlowVector.set(flowX, flowY, flowZ);
    const localCurrent = this._localCurrentScratch;
    if (
      this._localCurrentEnabled &&
      insideFootprint &&
      this._localCurrentSampler?.sample(sourceKind, sourceIndex, queryX, queryZ, flowX, flowZ, localCurrent)
    ) {
      const baseSpeed = Math.hypot(flowX, flowZ);
      result.localFlowVector.set(localCurrent.localFlowX * baseSpeed, flowY, localCurrent.localFlowZ * baseSpeed);
      result.localFlowWeight = localCurrent.localFlowWeight;
      result.flowVector.set(localCurrent.finalFlowX, flowY, localCurrent.finalFlowZ);
    } else {
      result.localFlowVector.set(0, 0, 0);
      result.localFlowWeight = 0;
      result.flowVector.set(flowX, flowY, flowZ);
    }
    result.surfaceNormal.set(normalX, normalY, normalZ);
  }
}

/** Shared immutable vertex facts, bounded independently of river size. Dynamic surface motion stays live. */
class RiverVertexSampleCache {
  readonly values = new Float64Array(1024 * 8);
  private readonly geometries: (RiverGeometryData | undefined)[] = new Array(1024);
  private readonly indices = new Uint32Array(1024);

  sample(geometry: RiverGeometryData, index: number): number {
    const entry = index & 1023,
      slot = entry * 8;
    if (this.geometries[entry] === geometry && this.indices[entry] === index) return slot;
    const tangent = geometry.tangents![index],
      normal = geometry.normals![index];
    const length = Math.hypot(tangent[0], tangent[2]) || 1;
    const tx = tangent[0] / length,
      tz = tangent[2] / length;
    const inverseY = 1 / Math.max(normal[1], 0.000001),
      gradient = geometry.motionGradients?.[index];
    // Match the static zero-amplitude expression and operation order, including signed zero.
    const nx = normal[0] * inverseY - (gradient?.[0] ?? -tz) * 0 - (gradient?.[2] ?? tx) * 0;
    const nz = normal[2] * inverseY - (gradient?.[1] ?? tx) * 0 - (gradient?.[3] ?? tz) * 0;
    const normalLength = Math.hypot(nx, 1, nz) || 1;
    const values = this.values;
    values[slot] = tx;
    values[slot + 1] = tz;
    values[slot + 2] = inverseY;
    values[slot + 3] = nx / normalLength;
    values[slot + 4] = 1 / normalLength;
    values[slot + 5] = nz / normalLength;
    values[slot + 6] = tx * geometry.uv1s[index][0];
    values[slot + 7] = tz * geometry.uv1s[index][0];
    this.geometries[entry] = geometry;
    this.indices[entry] = index;
    return slot;
  }
}
