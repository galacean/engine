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
import { RiverChunkSourceKind, RiverQueryPrimitiveKind } from "../../compiler/river/RiverGeometryEnums";
import type { RiverCompiledData, RiverQuerySourceData, RiverSamplePoint } from "../../compiler/river/types";
import { RIVER_QUERY_EPSILON, RIVER_QUERY_NO_SOURCE_INDEX, RIVER_QUERY_NO_SOURCE_KIND } from "./constants";
import type { RiverNetworkQueryBatchOutput, RiverNetworkQueryResult, RiverQueryResult } from "./types";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function read(source: RiverQuerySourceData, sampleIndex: number, componentIndex: number): number {
  return source.samples.at(sampleIndex * source.stride + componentIndex) ?? 0;
}

function makeFlowDirection(source: RiverQuerySourceData, aIndex: number, bIndex: number): Vector3 {
  const dx = read(source, bIndex, 0) - read(source, aIndex, 0);
  const dz = read(source, bIndex, 2) - read(source, aIndex, 2);
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 0.0001) {
    return new Vector3(read(source, aIndex, 7), 0, read(source, aIndex, 8));
  }
  return new Vector3(dx / length, 0, dz / length);
}

function interpolateSampleValue(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function queryRiver(source: RiverQuerySourceData, worldPosition: Vector3): RiverQueryResult {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestT = 0;
  let bestIndex = 0;

  for (let i = 0; i < source.sampleCount - 1; i++) {
    const ax = read(source, i, 0);
    const az = read(source, i, 2);
    const bx = read(source, i + 1, 0);
    const bz = read(source, i + 1, 2);
    const abx = bx - ax;
    const abz = bz - az;
    const apx = worldPosition.x - ax;
    const apz = worldPosition.z - az;
    const abLengthSq = abx * abx + abz * abz;
    const t = abLengthSq > 0.0001 ? clamp01((apx * abx + apz * abz) / abLengthSq) : 0;
    const closestX = ax + abx * t;
    const closestZ = az + abz * t;
    const dx = worldPosition.x - closestX;
    const dz = worldPosition.z - closestZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestT = t;
      bestIndex = i;
    }
  }

  const nextIndex = Math.min(bestIndex + 1, source.sampleCount - 1);
  const surfaceHeight = interpolateSampleValue(read(source, bestIndex, 1), read(source, nextIndex, 1), bestT);
  const flowDirection = makeFlowDirection(source, bestIndex, nextIndex);
  const width = interpolateSampleValue(read(source, bestIndex, 4), read(source, nextIndex, 4), bestT);
  const depth = interpolateSampleValue(read(source, bestIndex, 5), read(source, nextIndex, 5), bestT);
  const flowSpeed = interpolateSampleValue(read(source, bestIndex, 6), read(source, nextIndex, 6), bestT);
  const halfWidth = width * 0.5;
  const distanceToBank = halfWidth - bestDistance;

  return {
    inWater: bestDistance <= halfWidth,
    surfaceHeight,
    depth: Math.max(0, depth * clamp01(distanceToBank / Math.max(halfWidth, 0.001))),
    flowDirection,
    flowSpeed,
    distanceToBank
  };
}

export function getPointAtRiverT(samples: RiverSamplePoint[], t: number): Vector3 {
  const totalLength = samples[samples.length - 1]?.distance ?? 0;
  const targetDistance = totalLength * clamp01(t);

  for (let i = 1; i < samples.length; i++) {
    const current = samples[i];
    if (current.distance < targetDistance) {
      continue;
    }
    const previous = samples[i - 1];
    const segmentLength = Math.max(current.distance - previous.distance, 0.001);
    const segmentT = clamp01((targetDistance - previous.distance) / segmentLength);
    return new Vector3(
      previous.position.x + (current.position.x - previous.position.x) * segmentT,
      previous.position.y + (current.position.y - previous.position.y) * segmentT,
      previous.position.z + (current.position.z - previous.position.z) * segmentT
    );
  }

  const last = samples[samples.length - 1].position;
  return new Vector3(last.x, last.y, last.z);
}

function distancePointToSegmentXZ(
  pointX: number,
  pointZ: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSquared = abx * abx + abz * abz;
  const t =
    lengthSquared > RIVER_QUERY_EPSILON
      ? clamp01(((pointX - ax) * abx + (pointZ - az) * abz) / lengthSquared)
      : 0;
  return Math.hypot(pointX - (ax + abx * t), pointZ - (az + abz * t));
}

function isPointInsidePolygonXZ(boundary: Float32Array, pointX: number, pointZ: number): boolean {
  let inside = false;
  const count = boundary.length / 3;
  for (let current = 0, previous = count - 1; current < count; previous = current++) {
    const currentX = boundary[current * 3];
    const currentZ = boundary[current * 3 + 2];
    const previousX = boundary[previous * 3];
    const previousZ = boundary[previous * 3 + 2];
    const crosses =
      currentZ > pointZ !== previousZ > pointZ &&
      pointX < ((previousX - currentX) * (pointZ - currentZ)) / (previousZ - currentZ) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToPolygonBankXZ(boundary: Float32Array, pointX: number, pointZ: number): number {
  let distance = Number.POSITIVE_INFINITY;
  const count = boundary.length / 3;
  for (let current = 0, previous = count - 1; current < count; previous = current++) {
    distance = Math.min(
      distance,
      distancePointToSegmentXZ(
        pointX,
        pointZ,
        boundary[previous * 3],
        boundary[previous * 3 + 2],
        boundary[current * 3],
        boundary[current * 3 + 2]
      )
    );
  }
  return distance;
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
    signedSurfaceDistance: 0,
    submergedDepth: 0,
    waterDepth: 0,
    distanceToBank: Number.NEGATIVE_INFINITY,
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
  result.signedSurfaceDistance = 0;
  result.submergedDepth = 0;
  result.waterDepth = 0;
  result.distanceToBank = Number.NEGATIVE_INFINITY;
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
  private readonly _batchScratch = createRiverNetworkQueryResult();

  constructor(private readonly _data: RiverCompiledData) {
    const index = _data.queryIndex;
    this._primitiveKinds = index.primitiveKinds.toTypedArray();
    this._primitiveSourceIndices = index.primitiveSourceIndices.toTypedArray();
    this._primitiveLocalIndices = index.primitiveLocalIndices.toTypedArray();
    this._primitiveBounds = index.primitiveBounds.toTypedArray();
    this._cellCoordinates = index.cellCoordinates.toTypedArray();
    this._cellOffsets = index.cellOffsets.toTypedArray();
    this._cellPrimitiveIndices = index.cellPrimitiveIndices.toTypedArray();
    this._reachSamples = _data.reaches.map((reach) => reach.artifact.querySource.samples.toTypedArray());
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

  sampleSurface(worldPosition: Vector3, outResult: RiverNetworkQueryResult): boolean {
    return this._sample(worldPosition.x, worldPosition.y, worldPosition.z, outResult, true);
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
    const count = Math.floor(positions.length / 3);
    if (!this._hasBatchCapacity(out, count)) {
      throw new RangeError("River query batch output capacity is smaller than the position count.");
    }
    for (let index = 0; index < count; index++) {
      const offset = index * 3;
      const result = this._batchScratch;
      this._sample(positions[offset], positions[offset + 1], positions[offset + 2], result, true);
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
    useIndex: boolean
  ): boolean {
    resetNetworkResult(outResult, this._data.sourceId);
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
          outResult
        );
      }
    } else {
      for (let primitiveIndex = 0; primitiveIndex < this._primitiveKinds.length; primitiveIndex++) {
        bestDistanceToBank = this._samplePrimitive(
          primitiveIndex,
          x,
          y,
          z,
          bestDistanceToBank,
          outResult
        );
      }
    }
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
    outResult: RiverNetworkQueryResult
  ): number {
    const boundsOffset = primitiveIndex * 4;
    if (
      x < this._primitiveBounds[boundsOffset] ||
      z < this._primitiveBounds[boundsOffset + 1] ||
      x > this._primitiveBounds[boundsOffset + 2] ||
      z > this._primitiveBounds[boundsOffset + 3]
    ) {
      return bestDistanceToBank;
    }
    return this._primitiveKinds[primitiveIndex] === RiverQueryPrimitiveKind.Junction
      ? this._sampleJunction(primitiveIndex, x, y, z, bestDistanceToBank, outResult)
      : this._sampleReachSpan(primitiveIndex, x, y, z, bestDistanceToBank, outResult);
  }

  private _sampleReachSpan(
    primitiveIndex: number,
    x: number,
    y: number,
    z: number,
    bestDistanceToBank: number,
    outResult: RiverNetworkQueryResult
  ): number {
    const reachIndex = this._primitiveSourceIndices[primitiveIndex];
    const spanIndex = this._primitiveLocalIndices[primitiveIndex];
    const samples = this._reachSamples[reachIndex];
    const stride = this._reachSampleStrides[reachIndex];
    const aOffset = spanIndex * stride;
    const bOffset = aOffset + stride;
    const ax = samples[aOffset];
    const ay = samples[aOffset + 1];
    const az = samples[aOffset + 2];
    const bx = samples[bOffset];
    const by = samples[bOffset + 1];
    const bz = samples[bOffset + 2];
    const abx = bx - ax;
    const abz = bz - az;
    const horizontalLengthSquared = abx * abx + abz * abz;
    const t =
      horizontalLengthSquared > RIVER_QUERY_EPSILON
        ? clamp01(((x - ax) * abx + (z - az) * abz) / horizontalLengthSquared)
        : 0;
    const dx = x - (ax + abx * t);
    const dz = z - (az + abz * t);
    const centerDistance = Math.hypot(dx, dz);
    const width = interpolateSampleValue(samples[aOffset + 4], samples[bOffset + 4], t);
    const halfWidth = width * 0.5;
    const distanceToBank = halfWidth - centerDistance;
    if (distanceToBank <= bestDistanceToBank) return bestDistanceToBank;
    const surfaceHeight = interpolateSampleValue(ay, by, t);
    const profileDepth = interpolateSampleValue(samples[aOffset + 5], samples[bOffset + 5], t);
    const waterDepth = Math.max(
      0,
      profileDepth * clamp01(distanceToBank / Math.max(halfWidth, RIVER_QUERY_EPSILON))
    );
    const flowSpeed = interpolateSampleValue(samples[aOffset + 6], samples[bOffset + 6], t);
    const horizontalLength = Math.sqrt(horizontalLengthSquared);
    const tangentX = horizontalLength > RIVER_QUERY_EPSILON ? abx / horizontalLength : samples[aOffset + 7];
    const tangentZ = horizontalLength > RIVER_QUERY_EPSILON ? abz / horizontalLength : samples[aOffset + 8];
    const slope = horizontalLength > RIVER_QUERY_EPSILON ? (by - ay) / horizontalLength : 0;
    const normalLength = Math.hypot(tangentX * slope, 1, tangentZ * slope);
    this._writeResult(
      outResult,
      RiverChunkSourceKind.Reach,
      reachIndex,
      this._data.reaches[reachIndex].id,
      distanceToBank,
      surfaceHeight,
      waterDepth,
      y,
      tangentX * flowSpeed,
      0,
      tangentZ * flowSpeed,
      (-tangentX * slope) / normalLength,
      1 / normalLength,
      (-tangentZ * slope) / normalLength
    );
    return distanceToBank;
  }

  private _sampleJunction(
    primitiveIndex: number,
    x: number,
    y: number,
    z: number,
    bestDistanceToBank: number,
    outResult: RiverNetworkQueryResult
  ): number {
    const junctionIndex = this._primitiveSourceIndices[primitiveIndex];
    const junction = this._data.junctions[junctionIndex];
    const boundary = this._junctionBoundaries[junctionIndex];
    const bankDistance = distanceToPolygonBankXZ(boundary, x, z);
    const distanceToBank = isPointInsidePolygonXZ(boundary, x, z) ? bankDistance : -bankDistance;
    if (distanceToBank <= bestDistanceToBank) return bestDistanceToBank;
    const waterDepth =
      distanceToBank >= 0
        ? junction.depth * clamp01(distanceToBank / this._junctionInradii[junctionIndex])
        : 0;
    this._writeResult(
      outResult,
      RiverChunkSourceKind.Junction,
      junctionIndex,
      junction.id,
      distanceToBank,
      junction.position[1],
      waterDepth,
      y,
      junction.flowDirection[0] * junction.flowSpeed,
      0,
      junction.flowDirection[2] * junction.flowSpeed,
      0,
      1,
      0
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
    waterDepth: number,
    queryY: number,
    flowX: number,
    flowY: number,
    flowZ: number,
    normalX: number,
    normalY: number,
    normalZ: number
  ): void {
    const insideFootprint = distanceToBank >= 0;
    const signedSurfaceDistance = queryY - surfaceHeight;
    result.hit = true;
    result.segmentId = segmentId;
    result.sourceKind = sourceKind;
    result.sourceIndex = sourceIndex;
    result.insideFootprint = insideFootprint;
    result.surfaceHeight = surfaceHeight;
    result.signedSurfaceDistance = signedSurfaceDistance;
    result.waterDepth = waterDepth;
    result.insideVolume =
      insideFootprint &&
      signedSurfaceDistance <= RIVER_QUERY_EPSILON &&
      signedSurfaceDistance >= -waterDepth - RIVER_QUERY_EPSILON;
    result.submergedDepth = insideFootprint ? Math.min(waterDepth, Math.max(0, -signedSurfaceDistance)) : 0;
    result.distanceToBank = distanceToBank;
    result.flowVector.set(flowX, flowY, flowZ);
    result.surfaceNormal.set(normalX, normalY, normalZ);
  }
}
