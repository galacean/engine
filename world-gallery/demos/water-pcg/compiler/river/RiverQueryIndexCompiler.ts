import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import {
  RiverReadonlyFloat32Buffer,
  RiverReadonlyInt32Buffer,
  RiverReadonlyUint32Buffer
} from "../shared/ReadonlyNumericBuffer";
import { RiverQueryPrimitiveKind } from "./RiverGeometryEnums";
import { RIVER_QUERY_BOUNDS_STRIDE, RIVER_QUERY_CELL_SIZE_BY_QUALITY, RIVER_QUERY_SAMPLE_STRIDE } from "./constants";
import type { RiverCompiledReach, RiverJunctionArtifact, RiverQueryIndexData } from "./types";

interface QueryPrimitive {
  readonly kind: RiverQueryPrimitiveKind;
  readonly sourceIndex: number;
  readonly localIndex: number;
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

interface QueryCell {
  readonly x: number;
  readonly z: number;
  readonly primitiveIndices: number[];
}

function readSample(reach: RiverCompiledReach, sampleIndex: number, componentIndex: number): number {
  return reach.artifact.querySource.samples.at(sampleIndex * RIVER_QUERY_SAMPLE_STRIDE + componentIndex) ?? 0;
}

function createReachPrimitives(reaches: readonly RiverCompiledReach[]): QueryPrimitive[] {
  const primitives: QueryPrimitive[] = [];
  for (let reachIndex = 0; reachIndex < reaches.length; reachIndex++) {
    const reach = reaches[reachIndex];
    const sampleCount = reach.artifact.querySource.sampleCount;
    const surfacePositions = reach.artifact.surfaceGeometry.positions;
    const rowWidth = sampleCount > 0 ? surfacePositions.length / sampleCount : 0;
    for (let spanIndex = 0; spanIndex + 1 < reach.artifact.querySource.sampleCount; spanIndex++) {
      const ax = readSample(reach, spanIndex, 0);
      const az = readSample(reach, spanIndex, 2);
      const bx = readSample(reach, spanIndex + 1, 0);
      const bz = readSample(reach, spanIndex + 1, 2);
      const halfWidth = Math.max(readSample(reach, spanIndex, 4), readSample(reach, spanIndex + 1, 4)) * 0.5;
      let minX = Math.min(ax, bx) - halfWidth;
      let minZ = Math.min(az, bz) - halfWidth;
      let maxX = Math.max(ax, bx) + halfWidth;
      let maxZ = Math.max(az, bz) + halfWidth;
      if (Number.isInteger(rowWidth) && rowWidth > 0) {
        const firstVertex = spanIndex * rowWidth;
        const endVertex = Math.min(surfacePositions.length, firstVertex + rowWidth * 2);
        for (let vertexIndex = firstVertex; vertexIndex < endVertex; vertexIndex++) {
          const position = surfacePositions[vertexIndex];
          minX = Math.min(minX, position[0]);
          minZ = Math.min(minZ, position[2]);
          maxX = Math.max(maxX, position[0]);
          maxZ = Math.max(maxZ, position[2]);
        }
      }
      primitives.push({
        kind: RiverQueryPrimitiveKind.ReachSpan,
        sourceIndex: reachIndex,
        localIndex: spanIndex,
        minX,
        minZ,
        maxX,
        maxZ
      });
    }
  }
  return primitives;
}

function createJunctionPrimitives(junctions: readonly RiverJunctionArtifact[]): QueryPrimitive[] {
  return junctions.map((junction, junctionIndex) => {
    let minX = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const position of junction.queryBoundary) {
      minX = Math.min(minX, position[0]);
      minZ = Math.min(minZ, position[2]);
      maxX = Math.max(maxX, position[0]);
      maxZ = Math.max(maxZ, position[2]);
    }
    return {
      kind: RiverQueryPrimitiveKind.Junction,
      sourceIndex: junctionIndex,
      localIndex: 0,
      minX,
      minZ,
      maxX,
      maxZ
    };
  });
}

function resolveCellSize(level: RiverQualityLevel): number {
  switch (level) {
    case RiverQualityLevel.Low:
      return RIVER_QUERY_CELL_SIZE_BY_QUALITY.low;
    case RiverQualityLevel.High:
      return RIVER_QUERY_CELL_SIZE_BY_QUALITY.high;
    default:
      return RIVER_QUERY_CELL_SIZE_BY_QUALITY.medium;
  }
}

function createCells(primitives: readonly QueryPrimitive[], cellSize: number): QueryCell[] {
  const cellByKey = new Map<string, QueryCell>();
  for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex++) {
    const primitive = primitives[primitiveIndex];
    const minCellX = Math.floor(primitive.minX / cellSize);
    const minCellZ = Math.floor(primitive.minZ / cellSize);
    const maxCellX = Math.floor(primitive.maxX / cellSize);
    const maxCellZ = Math.floor(primitive.maxZ / cellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const key = `${cellX},${cellZ}`;
        let cell = cellByKey.get(key);
        if (!cell) {
          cell = { x: cellX, z: cellZ, primitiveIndices: [] };
          cellByKey.set(key, cell);
        }
        cell.primitiveIndices.push(primitiveIndex);
      }
    }
  }
  return Array.from(cellByKey.values()).sort((a, b) => a.x - b.x || a.z - b.z);
}

export function compileRiverQueryIndex(
  reaches: readonly RiverCompiledReach[],
  junctions: readonly RiverJunctionArtifact[],
  level: RiverQualityLevel
): RiverQueryIndexData {
  const primitives = [...createReachPrimitives(reaches), ...createJunctionPrimitives(junctions)];
  const cellSize = resolveCellSize(level);
  const cells = createCells(primitives, cellSize);
  const primitiveKinds = new Uint32Array(primitives.length);
  const primitiveSourceIndices = new Uint32Array(primitives.length);
  const primitiveLocalIndices = new Uint32Array(primitives.length);
  const primitiveBounds = new Float32Array(primitives.length * RIVER_QUERY_BOUNDS_STRIDE);
  for (let index = 0; index < primitives.length; index++) {
    const primitive = primitives[index];
    primitiveKinds[index] = primitive.kind;
    primitiveSourceIndices[index] = primitive.sourceIndex;
    primitiveLocalIndices[index] = primitive.localIndex;
    const offset = index * RIVER_QUERY_BOUNDS_STRIDE;
    primitiveBounds[offset] = primitive.minX;
    primitiveBounds[offset + 1] = primitive.minZ;
    primitiveBounds[offset + 2] = primitive.maxX;
    primitiveBounds[offset + 3] = primitive.maxZ;
  }
  const cellCoordinates = new Int32Array(cells.length * 2);
  const cellOffsets = new Uint32Array(cells.length + 1);
  const cellPrimitiveIndices: number[] = [];
  for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
    const cell = cells[cellIndex];
    cellCoordinates[cellIndex * 2] = cell.x;
    cellCoordinates[cellIndex * 2 + 1] = cell.z;
    cellOffsets[cellIndex] = cellPrimitiveIndices.length;
    cellPrimitiveIndices.push(...cell.primitiveIndices);
  }
  cellOffsets[cells.length] = cellPrimitiveIndices.length;
  return Object.freeze({
    cellSize,
    primitiveCount: primitives.length,
    cellCount: cells.length,
    primitiveKinds: new RiverReadonlyUint32Buffer(primitiveKinds),
    primitiveSourceIndices: new RiverReadonlyUint32Buffer(primitiveSourceIndices),
    primitiveLocalIndices: new RiverReadonlyUint32Buffer(primitiveLocalIndices),
    primitiveBounds: new RiverReadonlyFloat32Buffer(primitiveBounds),
    cellCoordinates: new RiverReadonlyInt32Buffer(cellCoordinates),
    cellOffsets: new RiverReadonlyUint32Buffer(cellOffsets),
    cellPrimitiveIndices: new RiverReadonlyUint32Buffer(cellPrimitiveIndices)
  });
}
