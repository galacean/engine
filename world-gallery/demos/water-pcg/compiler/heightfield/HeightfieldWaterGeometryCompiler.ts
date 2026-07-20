/** Deterministic curved mesh generation using centre vertices and component-scoped shared corners. */
import type { HeightfieldWaterGridConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
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

export function createHeightfieldWaterRenderCells(
  prepared: PreparedHeightfieldWaterData,
  aggregationScale: number
): readonly HeightfieldWaterRenderCell[] {
  const { descriptor, components, surfaceHeights } = prepared;
  const { grid } = descriptor;
  const coarseWidth = Math.ceil(grid.width / aggregationScale);
  const cells: HeightfieldWaterRenderCell[] = [];
  for (const component of components) {
    const blocks = new Map<number, { total: number; count: number }>();
    for (const texelIndex of component.wetTexelIndices) {
      const sourceX = texelIndex % grid.width;
      const sourceZ = Math.floor(texelIndex / grid.width);
      const blockX = Math.floor(sourceX / aggregationScale);
      const blockZ = Math.floor(sourceZ / aggregationScale);
      const blockIndex = blockZ * coarseWidth + blockX;
      const accumulator = blocks.get(blockIndex) ?? { total: 0, count: 0 };
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
  aggregationScale: number
): HeightfieldWaterSurfaceTopology {
  const cells = createHeightfieldWaterRenderCells(prepared, aggregationScale);
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
