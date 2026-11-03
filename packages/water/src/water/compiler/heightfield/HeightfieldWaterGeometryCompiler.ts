/** Deterministic curved mesh generation using centre vertices and component-scoped shared corners. */
import type { HeightfieldWaterDescriptorV1 } from "../../authoring/heightfield/HeightfieldWaterDescriptor";
import type {
  HeightfieldWaterBudgetConfig,
  HeightfieldWaterGridConfig
} from "../../authoring/heightfield/HeightfieldWaterTypes";
import { HeightfieldReadonlyFloat32Buffer, HeightfieldReadonlyUint16Buffer } from "./HeightfieldNumericBuffer";
import type {
  HeightfieldWaterCompiledChunk,
  HeightfieldWaterGeometryData,
  HeightfieldWaterVector3,
  HeightfieldWaterVector4
} from "./HeightfieldWaterCompiledTypes";
import { HEIGHTFIELD_WATER_CHUNK_CELL_SIZE, HEIGHTFIELD_WATER_UINT16_VERTEX_LIMIT } from "./constants";
import type {
  HeightfieldWaterRenderCell,
  HeightfieldWaterSurfaceTopology,
  HeightfieldWaterSurfaceVertex,
  PreparedHeightfieldWaterData
} from "./internalTypes";
import { HeightfieldWaterGeneratedBudgetExceededError } from "./internalTypes";

interface HeightAccumulator {
  total: number;
  count: number;
  worldX: number;
  worldZ: number;
}

interface NormalAccumulator {
  x: number;
  y: number;
  z: number;
}

const TRIANGLE_CORNER_ORDER = [
  [1, 0],
  [2, 1],
  [3, 2],
  [0, 3]
] as const;

function vector3(x: number, y: number, z: number): HeightfieldWaterVector3 {
  return Object.freeze([x, y, z] as const);
}

function vector4(x: number, y: number, z: number, w: number): HeightfieldWaterVector4 {
  return Object.freeze([x, y, z, w] as const);
}

function cornerKey(componentIndex: number, x: number, z: number): string {
  return `${componentIndex}:corner:${x}:${z}`;
}

function centerKey(cell: HeightfieldWaterRenderCell): string {
  return `${cell.id}:center`;
}

function cellCornerKeys(cell: HeightfieldWaterRenderCell): readonly [string, string, string, string] {
  return [
    cornerKey(cell.componentIndex, cell.blockX, cell.blockZ),
    cornerKey(cell.componentIndex, cell.blockX + 1, cell.blockZ),
    cornerKey(cell.componentIndex, cell.blockX + 1, cell.blockZ + 1),
    cornerKey(cell.componentIndex, cell.blockX, cell.blockZ + 1)
  ];
}

function sourceBoundaryWorldX(grid: HeightfieldWaterGridConfig, sourceX: number): number {
  return grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5 + sourceX * grid.cellSizeXZ[0];
}

function sourceBoundaryWorldZ(grid: HeightfieldWaterGridConfig, sourceZ: number): number {
  return grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5 + sourceZ * grid.cellSizeXZ[1];
}

/**
 * Source-only conservative guard used before PreparedData allocation. It may
 * under-count disconnected components sharing one coarse block, but every
 * count it rejects is an unavoidable topology allocation.
 */
export function preflightHeightfieldWaterTopologyAllocation(
  descriptor: HeightfieldWaterDescriptorV1,
  aggregationScale: number,
  budget: Readonly<Pick<HeightfieldWaterBudgetConfig, "maxVertexCount" | "maxTriangleCount" | "maxChunkCount">>
): void {
  if (descriptor.renderSurface) return;
  const coarseWidth = Math.ceil(descriptor.grid.width / aggregationScale);
  const blocks = new Set<number>();
  const chunkKeys = new Set<string>();
  for (const texelIndex of descriptor.wetTexelIndices) {
    const sourceX = texelIndex % descriptor.grid.width;
    const sourceZ = Math.floor(texelIndex / descriptor.grid.width);
    const blockX = Math.floor(sourceX / aggregationScale);
    const blockZ = Math.floor(sourceZ / aggregationScale);
    const blockIndex = blockZ * coarseWidth + blockX;
    if (blocks.has(blockIndex)) continue;
    const nextCellCount = blocks.size + 1;
    if (nextCellCount * 4 > budget.maxTriangleCount) {
      throw new HeightfieldWaterGeneratedBudgetExceededError(
        "maxTriangleCount",
        nextCellCount * 4,
        budget.maxTriangleCount
      );
    }
    if (nextCellCount + 4 > budget.maxVertexCount) {
      throw new HeightfieldWaterGeneratedBudgetExceededError(
        "maxVertexCount",
        nextCellCount + 4,
        budget.maxVertexCount
      );
    }
    const chunkKey = `${Math.floor(blockZ / HEIGHTFIELD_WATER_CHUNK_CELL_SIZE)}:${Math.floor(
      blockX / HEIGHTFIELD_WATER_CHUNK_CELL_SIZE
    )}`;
    if (!chunkKeys.has(chunkKey)) {
      if (chunkKeys.size + 1 > budget.maxChunkCount) {
        throw new HeightfieldWaterGeneratedBudgetExceededError(
          "maxChunkCount",
          chunkKeys.size + 1,
          budget.maxChunkCount
        );
      }
      chunkKeys.add(chunkKey);
    }
    blocks.add(blockIndex);
  }
}

export function createHeightfieldWaterRenderCells(
  prepared: PreparedHeightfieldWaterData,
  aggregationScale: number,
  budget?: Readonly<Pick<HeightfieldWaterBudgetConfig, "maxVertexCount" | "maxTriangleCount" | "maxChunkCount">>
): readonly HeightfieldWaterRenderCell[] {
  const { descriptor, components, surfaceHeights } = prepared;
  const { grid } = descriptor;
  const coarseWidth = Math.ceil(grid.width / aggregationScale);
  const cells: HeightfieldWaterRenderCell[] = [];
  const chunkKeys = new Set<string>();
  for (const component of components) {
    const blocks = new Map<number, { total: number; count: number }>();
    for (const texelIndex of component.wetTexelIndices) {
      const sourceX = texelIndex % grid.width;
      const sourceZ = Math.floor(texelIndex / grid.width);
      const blockX = Math.floor(sourceX / aggregationScale);
      const blockZ = Math.floor(sourceZ / aggregationScale);
      const blockIndex = blockZ * coarseWidth + blockX;
      let accumulator = blocks.get(blockIndex);
      if (!accumulator) {
        const nextCellCount = cells.length + blocks.size + 1;
        if (budget && nextCellCount * 4 > budget.maxTriangleCount) {
          throw new HeightfieldWaterGeneratedBudgetExceededError(
            "maxTriangleCount",
            nextCellCount * 4,
            budget.maxTriangleCount
          );
        }
        // Every cell owns one centre and at least four corners exist in the
        // first published topology. This is a conservative allocation lower bound.
        if (budget && nextCellCount + 4 > budget.maxVertexCount) {
          throw new HeightfieldWaterGeneratedBudgetExceededError(
            "maxVertexCount",
            nextCellCount + 4,
            budget.maxVertexCount
          );
        }
        const tileX = Math.floor(blockX / HEIGHTFIELD_WATER_CHUNK_CELL_SIZE);
        const tileZ = Math.floor(blockZ / HEIGHTFIELD_WATER_CHUNK_CELL_SIZE);
        const chunkKey = `${tileZ}:${tileX}`;
        if (!chunkKeys.has(chunkKey)) {
          if (budget && chunkKeys.size + 1 > budget.maxChunkCount) {
            throw new HeightfieldWaterGeneratedBudgetExceededError(
              "maxChunkCount",
              chunkKeys.size + 1,
              budget.maxChunkCount
            );
          }
          chunkKeys.add(chunkKey);
        }
        accumulator = { total: 0, count: 0 };
      }
      accumulator.total += surfaceHeights[texelIndex];
      accumulator.count++;
      blocks.set(blockIndex, accumulator);
    }
    for (const blockIndex of [...blocks.keys()].sort((a, b) => a - b)) {
      const block = blocks.get(blockIndex)!;
      const blockX = blockIndex % coarseWidth;
      const blockZ = Math.floor(blockIndex / coarseWidth);
      const minSourceX = blockX * aggregationScale;
      const minSourceZ = blockZ * aggregationScale;
      const maxSourceX = Math.min(grid.width, minSourceX + aggregationScale);
      const maxSourceZ = Math.min(grid.height, minSourceZ + aggregationScale);
      cells.push(
        Object.freeze({
          id: `${descriptor.id}:component:${component.index}:cell:${blockX}:${blockZ}`,
          componentIndex: component.index,
          blockX,
          blockZ,
          minSourceX,
          minSourceZ,
          maxSourceX,
          maxSourceZ,
          centerX: sourceBoundaryWorldX(grid, (minSourceX + maxSourceX) * 0.5),
          centerZ: sourceBoundaryWorldZ(grid, (minSourceZ + maxSourceZ) * 0.5),
          centerHeight: block.total / block.count
        })
      );
    }
  }
  return Object.freeze(cells);
}

function addFaceNormal(
  accumulators: Map<string, NormalAccumulator>,
  keys: readonly [string, string, string],
  positions: ReadonlyMap<string, readonly [number, number, number]>
): void {
  const a = positions.get(keys[0])!;
  const b = positions.get(keys[1])!;
  const c = positions.get(keys[2])!;
  const abX = b[0] - a[0];
  const abY = b[1] - a[1];
  const abZ = b[2] - a[2];
  const acX = c[0] - a[0];
  const acY = c[1] - a[1];
  const acZ = c[2] - a[2];
  const normalX = abY * acZ - abZ * acY;
  const normalY = abZ * acX - abX * acZ;
  const normalZ = abX * acY - abY * acX;
  for (const key of keys) {
    const accumulator = accumulators.get(key)!;
    accumulator.x += normalX;
    accumulator.y += normalY;
    accumulator.z += normalZ;
  }
}

function createSurfaceVertex(
  key: string,
  position: readonly [number, number, number],
  accumulatedNormal: NormalAccumulator
): HeightfieldWaterSurfaceVertex {
  const length = Math.hypot(accumulatedNormal.x, accumulatedNormal.y, accumulatedNormal.z);
  const normalX = length > 1e-8 ? accumulatedNormal.x / length : 0;
  const normalY = length > 1e-8 ? accumulatedNormal.y / length : 1;
  const normalZ = length > 1e-8 ? accumulatedNormal.z / length : 0;
  const tangentLength = Math.hypot(normalY, normalX) || 1;
  return Object.freeze({
    key,
    worldX: position[0],
    worldY: position[1],
    worldZ: position[2],
    normalX,
    normalY,
    normalZ,
    tangentX: normalY / tangentLength,
    tangentY: -normalX / tangentLength,
    tangentZ: 0
  });
}

export function createHeightfieldWaterSurfaceTopology(
  prepared: PreparedHeightfieldWaterData,
  aggregationScale: number,
  budget?: Readonly<Pick<HeightfieldWaterBudgetConfig, "maxVertexCount" | "maxTriangleCount" | "maxChunkCount">>
): HeightfieldWaterSurfaceTopology {
  const cells = createHeightfieldWaterRenderCells(prepared, aggregationScale, budget);
  const { grid } = prepared.descriptor;
  const cornerHeights = new Map<string, HeightAccumulator>();
  const positions = new Map<string, readonly [number, number, number]>();

  for (const cell of cells) {
    const sourceCorners = [
      [cell.minSourceX, cell.minSourceZ],
      [cell.maxSourceX, cell.minSourceZ],
      [cell.maxSourceX, cell.maxSourceZ],
      [cell.minSourceX, cell.maxSourceZ]
    ] as const;
    const keys = cellCornerKeys(cell);
    for (let cornerIndex = 0; cornerIndex < keys.length; cornerIndex++) {
      const key = keys[cornerIndex];
      const [sourceX, sourceZ] = sourceCorners[cornerIndex];
      const accumulator = cornerHeights.get(key) ?? {
        total: 0,
        count: 0,
        worldX: sourceBoundaryWorldX(grid, sourceX),
        worldZ: sourceBoundaryWorldZ(grid, sourceZ)
      };
      accumulator.total += cell.centerHeight;
      accumulator.count++;
      cornerHeights.set(key, accumulator);
    }
    positions.set(centerKey(cell), [cell.centerX, cell.centerHeight, cell.centerZ]);
  }
  for (const [key, accumulator] of cornerHeights) {
    positions.set(key, [accumulator.worldX, accumulator.total / accumulator.count, accumulator.worldZ]);
  }

  const normalAccumulators = new Map<string, NormalAccumulator>();
  for (const key of positions.keys()) normalAccumulators.set(key, { x: 0, y: 0, z: 0 });
  for (const cell of cells) {
    const center = centerKey(cell);
    const corners = cellCornerKeys(cell);
    for (const [first, second] of TRIANGLE_CORNER_ORDER) {
      addFaceNormal(normalAccumulators, [center, corners[first], corners[second]], positions);
    }
  }

  const cornerVertices = new Map<string, HeightfieldWaterSurfaceVertex>();
  const centerVertices = new Map<string, HeightfieldWaterSurfaceVertex>();
  for (const [key, position] of positions) {
    const vertex = createSurfaceVertex(key, position, normalAccumulators.get(key)!);
    (key.endsWith(":center") ? centerVertices : cornerVertices).set(key, vertex);
  }
  return Object.freeze({
    cells,
    cornerVertices,
    centerVertices
  });
}

function createGeometry(
  cells: readonly HeightfieldWaterRenderCell[],
  topology: HeightfieldWaterSurfaceTopology,
  grid: HeightfieldWaterGridConfig,
  localOrigin: HeightfieldWaterVector3,
  maxDisplacement: number
): HeightfieldWaterGeometryData {
  const vertexIndices = new Map<string, number>();
  const positions: number[] = [];
  const normals: number[] = [];
  const tangents: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const gridMinX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
  const gridMinZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
  const inverseWidth = 1 / (grid.width * grid.cellSizeXZ[0]);
  const inverseHeight = 1 / (grid.height * grid.cellSizeXZ[1]);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  const addVertex = (key: string): number => {
    const existing = vertexIndices.get(key);
    if (existing !== undefined) return existing;
    const vertex = topology.centerVertices.get(key) ?? topology.cornerVertices.get(key);
    if (!vertex) throw new Error(`Missing heightfield surface vertex ${key}.`);
    const index = vertexIndices.size;
    vertexIndices.set(key, index);
    const x = vertex.worldX - localOrigin[0];
    const y = vertex.worldY - localOrigin[1];
    const z = vertex.worldZ - localOrigin[2];
    positions.push(x, y, z);
    normals.push(vertex.normalX, vertex.normalY, vertex.normalZ);
    tangents.push(vertex.tangentX, vertex.tangentY, vertex.tangentZ, 1);
    uvs.push((vertex.worldX - gridMinX) * inverseWidth, (vertex.worldZ - gridMinZ) * inverseHeight);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    return index;
  };

  for (const cell of cells) {
    const center = addVertex(centerKey(cell));
    const cornerIndices = cellCornerKeys(cell).map(addVertex);
    for (const [first, second] of TRIANGLE_CORNER_ORDER) {
      indices.push(center, cornerIndices[first], cornerIndices[second]);
    }
  }
  return Object.freeze({
    positions: new HeightfieldReadonlyFloat32Buffer(positions),
    normals: new HeightfieldReadonlyFloat32Buffer(normals),
    tangents: new HeightfieldReadonlyFloat32Buffer(tangents),
    uvs: new HeightfieldReadonlyFloat32Buffer(uvs),
    indices: new HeightfieldReadonlyUint16Buffer(indices),
    vertexCount: vertexIndices.size,
    indexCount: indices.length,
    bounds: Object.freeze({
      min: vector3(minX - maxDisplacement, minY - maxDisplacement, minZ - maxDisplacement),
      max: vector3(maxX + maxDisplacement, maxY + maxDisplacement, maxZ + maxDisplacement)
    })
  });
}

function countNewVertices(cell: HeightfieldWaterRenderCell, cornerKeys: ReadonlySet<string>): number {
  return 1 + cellCornerKeys(cell).filter((key) => !cornerKeys.has(key)).length;
}

export interface HeightfieldWaterGeometryEstimate {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly chunkCount: number;
}

/** Exact allocation counts using the same deterministic chunk partition rules as compilation. */
export function estimateHeightfieldWaterTopologyGeometry(
  topology: HeightfieldWaterSurfaceTopology
): Readonly<HeightfieldWaterGeometryEstimate> {
  const buckets = new Map<string, HeightfieldWaterRenderCell[]>();
  for (const cell of topology.cells) {
    const tileX = Math.floor(cell.blockX / HEIGHTFIELD_WATER_CHUNK_CELL_SIZE);
    const tileZ = Math.floor(cell.blockZ / HEIGHTFIELD_WATER_CHUNK_CELL_SIZE);
    const key = `${tileZ}:${tileX}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(cell);
    buckets.set(key, bucket);
  }
  let vertexCount = 0;
  let chunkCount = 0;
  for (const bucketCells of buckets.values()) {
    bucketCells.sort((a, b) => a.componentIndex - b.componentIndex || a.blockZ - b.blockZ || a.blockX - b.blockX);
    let partCellCount = 0;
    let partCornerKeys = new Set<string>();
    let partVertexCount = 0;
    const flush = (): void => {
      if (partCellCount === 0) return;
      vertexCount += partVertexCount;
      chunkCount++;
      partCellCount = 0;
      partCornerKeys = new Set<string>();
      partVertexCount = 0;
    };
    for (const cell of bucketCells) {
      const newVertexCount = countNewVertices(cell, partCornerKeys);
      if (partCellCount > 0 && partVertexCount + newVertexCount > HEIGHTFIELD_WATER_UINT16_VERTEX_LIMIT) flush();
      partCellCount++;
      partVertexCount += countNewVertices(cell, partCornerKeys);
      for (const key of cellCornerKeys(cell)) partCornerKeys.add(key);
    }
    flush();
  }
  return Object.freeze({
    vertexCount,
    triangleCount: topology.cells.length * 4,
    chunkCount
  });
}

export function estimateHeightfieldWaterRenderSurfaceGeometry(
  triangleVertexValueCount: number,
  lakeTriangles?: Float32Array
): Readonly<HeightfieldWaterGeometryEstimate> {
  const triangleCount = triangleVertexValueCount / 9;
  const maximumTrianglesPerChunk = Math.floor(HEIGHTFIELD_WATER_UINT16_VERTEX_LIMIT / 3);
  let vertexCount = triangleCount * 3;
  if (lakeTriangles) {
    vertexCount = 0;
    for (let start = 0; start < lakeTriangles.length; start += maximumTrianglesPerChunk * 9) {
      const keys = new Set<string>();
      for (let i = start; i < Math.min(lakeTriangles.length, start + maximumTrianglesPerChunk * 9); i += 3) {
        keys.add(`${lakeTriangles[i]}:${lakeTriangles[i + 1]}:${lakeTriangles[i + 2]}`);
      }
      vertexCount += keys.size;
    }
  }
  return Object.freeze({ vertexCount, triangleCount, chunkCount: Math.ceil(triangleCount / maximumTrianglesPerChunk) });
}

export function compileHeightfieldWaterChunks(
  prepared: PreparedHeightfieldWaterData,
  topology: HeightfieldWaterSurfaceTopology,
  maxDisplacement = 0
): readonly HeightfieldWaterCompiledChunk[] {
  const buckets = new Map<string, HeightfieldWaterRenderCell[]>();
  for (const cell of topology.cells) {
    const tileX = Math.floor(cell.blockX / HEIGHTFIELD_WATER_CHUNK_CELL_SIZE);
    const tileZ = Math.floor(cell.blockZ / HEIGHTFIELD_WATER_CHUNK_CELL_SIZE);
    const key = `${tileZ}:${tileX}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(cell);
    buckets.set(key, bucket);
  }

  const chunks: HeightfieldWaterCompiledChunk[] = [];
  const grid = prepared.descriptor.grid;
  const sortedBuckets = [...buckets.entries()].sort(([a], [b]) => {
    const [az, ax] = a.split(":").map(Number);
    const [bz, bx] = b.split(":").map(Number);
    return az - bz || ax - bx;
  });
  for (const [bucketKey, bucketCells] of sortedBuckets) {
    const [tileZ, tileX] = bucketKey.split(":").map(Number);
    bucketCells.sort((a, b) => a.componentIndex - b.componentIndex || a.blockZ - b.blockZ || a.blockX - b.blockX);
    let part = 0;
    let partCells: HeightfieldWaterRenderCell[] = [];
    let partCornerKeys = new Set<string>();
    let partVertexCount = 0;

    const flush = (): void => {
      if (partCells.length === 0) return;
      let minWorldX = Number.POSITIVE_INFINITY;
      let minWorldY = Number.POSITIVE_INFINITY;
      let minWorldZ = Number.POSITIVE_INFINITY;
      let maxWorldX = Number.NEGATIVE_INFINITY;
      let maxWorldZ = Number.NEGATIVE_INFINITY;
      const componentIndices = new Set<number>();
      for (const cell of partCells) {
        minWorldX = Math.min(minWorldX, sourceBoundaryWorldX(grid, cell.minSourceX));
        minWorldZ = Math.min(minWorldZ, sourceBoundaryWorldZ(grid, cell.minSourceZ));
        maxWorldX = Math.max(maxWorldX, sourceBoundaryWorldX(grid, cell.maxSourceX));
        maxWorldZ = Math.max(maxWorldZ, sourceBoundaryWorldZ(grid, cell.maxSourceZ));
        minWorldY = Math.min(minWorldY, cell.centerHeight);
        componentIndices.add(cell.componentIndex);
      }
      for (const key of partCornerKeys) minWorldY = Math.min(minWorldY, topology.cornerVertices.get(key)!.worldY);
      const localOrigin = vector3(minWorldX, minWorldY, minWorldZ);
      const geometry = createGeometry(partCells, topology, grid, localOrigin, maxDisplacement);
      const gridMinX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
      const gridMinZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
      const inverseWidth = 1 / (grid.width * grid.cellSizeXZ[0]);
      const inverseHeight = 1 / (grid.height * grid.cellSizeXZ[1]);
      chunks.push(
        Object.freeze({
          id: `${prepared.descriptor.id}:chunk:${tileX}:${tileZ}:${part}`,
          tileX,
          tileZ,
          part,
          localOrigin,
          componentIndices: Object.freeze([...componentIndices].sort((a, b) => a - b)),
          atlasUvRect: vector4(
            (minWorldX - gridMinX) * inverseWidth,
            (minWorldZ - gridMinZ) * inverseHeight,
            (maxWorldX - gridMinX) * inverseWidth,
            (maxWorldZ - gridMinZ) * inverseHeight
          ),
          geometry
        })
      );
      part++;
      partCells = [];
      partCornerKeys = new Set<string>();
      partVertexCount = 0;
    };

    for (const cell of bucketCells) {
      const newVertexCount = countNewVertices(cell, partCornerKeys);
      if (partCells.length > 0 && partVertexCount + newVertexCount > HEIGHTFIELD_WATER_UINT16_VERTEX_LIMIT) flush();
      partCells.push(cell);
      partVertexCount += countNewVertices(cell, partCornerKeys);
      for (const key of cellCornerKeys(cell)) partCornerKeys.add(key);
    }
    flush();
  }
  return Object.freeze(chunks);
}

/** Compiles a caller-provided render triangle surface without changing the semantic query grid. */
export function compileHeightfieldWaterRenderSurfaceChunks(
  prepared: PreparedHeightfieldWaterData,
  maxDisplacement = 0
): readonly HeightfieldWaterCompiledChunk[] {
  const renderSurface = prepared.descriptor.renderSurface;
  if (!renderSurface) return Object.freeze([]);
  const source = renderSurface.triangleVertices;
  const triangleCount = source.length / 9;
  const maximumTrianglesPerChunk = Math.floor(HEIGHTFIELD_WATER_UINT16_VERTEX_LIMIT / 3);
  const chunks: HeightfieldWaterCompiledChunk[] = [];
  const coverage = renderSurface.coverage;
  const grid = coverage === "geometry" ? prepared.descriptor.grid : coverage.grid;
  const gridMinX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
  const gridMinZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
  const inverseWidth = 1 / (grid.width * grid.cellSizeXZ[0]);
  const inverseHeight = 1 / (grid.height * grid.cellSizeXZ[1]);
  const componentIndices = Object.freeze(prepared.components.map(({ index }) => index));

  for (let firstTriangle = 0, part = 0; firstTriangle < triangleCount; part++) {
    const chunkTriangleCount = Math.min(maximumTrianglesPerChunk, triangleCount - firstTriangle);
    const firstValue = firstTriangle * 9;
    const valueCount = chunkTriangleCount * 9;
    let minWorldX = Number.POSITIVE_INFINITY;
    let minWorldY = Number.POSITIVE_INFINITY;
    let minWorldZ = Number.POSITIVE_INFINITY;
    let maxWorldX = Number.NEGATIVE_INFINITY;
    let maxWorldY = Number.NEGATIVE_INFINITY;
    let maxWorldZ = Number.NEGATIVE_INFINITY;
    for (let offset = firstValue; offset < firstValue + valueCount; offset += 3) {
      minWorldX = Math.min(minWorldX, source[offset]!);
      minWorldY = Math.min(minWorldY, source[offset + 1]!);
      minWorldZ = Math.min(minWorldZ, source[offset + 2]!);
      maxWorldX = Math.max(maxWorldX, source[offset]!);
      maxWorldY = Math.max(maxWorldY, source[offset + 1]!);
      maxWorldZ = Math.max(maxWorldZ, source[offset + 2]!);
    }
    const localOrigin = vector3(minWorldX, minWorldY, minWorldZ);
    const positions = new Float32Array(valueCount);
    const normals = new Float32Array(valueCount);
    const tangents = new Float32Array(chunkTriangleCount * 12);
    const uvs = new Float32Array(chunkTriangleCount * 6);
    const indices = new Uint16Array(chunkTriangleCount * 3);
    for (let triangle = 0; triangle < chunkTriangleCount; triangle++) {
      const sourceOffset = firstValue + triangle * 9;
      const positionOffset = triangle * 9;
      const ax = source[sourceOffset]!;
      const ay = source[sourceOffset + 1]!;
      const az = source[sourceOffset + 2]!;
      const bx = source[sourceOffset + 3]!;
      const by = source[sourceOffset + 4]!;
      const bz = source[sourceOffset + 5]!;
      const cx = source[sourceOffset + 6]!;
      const cy = source[sourceOffset + 7]!;
      const cz = source[sourceOffset + 8]!;
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      let normalX = aby * acz - abz * acy;
      let normalY = abz * acx - abx * acz;
      let normalZ = abx * acy - aby * acx;
      const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
      normalX /= normalLength;
      normalY /= normalLength;
      normalZ /= normalLength;
      const tangentLength = Math.hypot(normalY, normalX) || 1;
      const tangentX = normalY / tangentLength;
      const tangentY = Math.fround(-normalX / tangentLength);
      for (let vertex = 0; vertex < 3; vertex++) {
        const inputOffset = sourceOffset + vertex * 3;
        const outputOffset = positionOffset + vertex * 3;
        const worldX = source[inputOffset]!;
        const worldY = source[inputOffset + 1]!;
        const worldZ = source[inputOffset + 2]!;
        positions[outputOffset] = worldX - minWorldX;
        positions[outputOffset + 1] = worldY - minWorldY;
        positions[outputOffset + 2] = worldZ - minWorldZ;
        normals[outputOffset] = normalX;
        normals[outputOffset + 1] = normalY;
        normals[outputOffset + 2] = normalZ;
        const tangentOffset = triangle * 12 + vertex * 4;
        tangents[tangentOffset] = tangentX;
        tangents[tangentOffset + 1] = tangentY === 0 ? 0 : tangentY;
        tangents[tangentOffset + 2] = 0;
        tangents[tangentOffset + 3] = 1;
        const uvOffset = triangle * 6 + vertex * 2;
        uvs[uvOffset] = (worldX - gridMinX) * inverseWidth;
        uvs[uvOffset + 1] = (worldZ - gridMinZ) * inverseHeight;
        indices[triangle * 3 + vertex] = triangle * 3 + vertex;
      }
    }
    let vertexCount = chunkTriangleCount * 3;
    if (prepared.descriptor.lakeBoundary) {
      const unique = new Map<string, number>();
      for (let i = 0; i < chunkTriangleCount * 3; i++) {
        const sourceOffset = firstValue + i * 3;
        const key = `${source[sourceOffset]}:${source[sourceOffset + 1]}:${source[sourceOffset + 2]}`;
        let index = unique.get(key);
        if (index === undefined) {
          index = unique.size;
          unique.set(key, index);
          positions.copyWithin(index * 3, i * 3, i * 3 + 3);
          normals.copyWithin(index * 3, i * 3, i * 3 + 3);
          tangents.copyWithin(index * 4, i * 4, i * 4 + 4);
          uvs.copyWithin(index * 2, i * 2, i * 2 + 2);
        }
        indices[i] = index;
      }
      vertexCount = unique.size;
    }
    const chunkWorldSizeX = grid.cellSizeXZ[0] * HEIGHTFIELD_WATER_CHUNK_CELL_SIZE;
    const chunkWorldSizeZ = grid.cellSizeXZ[1] * HEIGHTFIELD_WATER_CHUNK_CELL_SIZE;
    const tileX = Math.max(0, Math.floor((minWorldX - gridMinX) / chunkWorldSizeX));
    const tileZ = Math.max(0, Math.floor((minWorldZ - gridMinZ) / chunkWorldSizeZ));
    chunks.push(
      Object.freeze({
        id: `${prepared.descriptor.id}:render-surface-chunk:${tileX}:${tileZ}:${part}`,
        tileX,
        tileZ,
        part,
        localOrigin,
        componentIndices,
        atlasUvRect: vector4(
          (minWorldX - gridMinX) * inverseWidth,
          (minWorldZ - gridMinZ) * inverseHeight,
          (maxWorldX - gridMinX) * inverseWidth,
          (maxWorldZ - gridMinZ) * inverseHeight
        ),
        geometry: Object.freeze({
          positions: new HeightfieldReadonlyFloat32Buffer(positions.subarray(0, vertexCount * 3)),
          normals: new HeightfieldReadonlyFloat32Buffer(normals.subarray(0, vertexCount * 3)),
          tangents: new HeightfieldReadonlyFloat32Buffer(tangents.subarray(0, vertexCount * 4)),
          uvs: new HeightfieldReadonlyFloat32Buffer(uvs.subarray(0, vertexCount * 2)),
          indices: new HeightfieldReadonlyUint16Buffer(indices),
          vertexCount,
          indexCount: chunkTriangleCount * 3,
          bounds: Object.freeze({
            min: vector3(-maxDisplacement, -maxDisplacement, -maxDisplacement),
            max: vector3(
              maxWorldX - minWorldX + maxDisplacement,
              maxWorldY - minWorldY + maxDisplacement,
              maxWorldZ - minWorldZ + maxDisplacement
            )
          })
        })
      })
    );
    firstTriangle += chunkTriangleCount;
  }
  return Object.freeze(chunks);
}
