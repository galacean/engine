import type { TerrainProjectDocument } from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import { terrainRasterIndex } from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";

const UINT16_MAX = 65_535;
const INTERSECTION_EPSILON = 1e-9;

/** World-space point used by the renderer-independent terrain editor. */
export interface TerrainWorldPoint {
  /** World X coordinate in metres. */
  readonly x: number;
  /** World Y coordinate in metres. */
  readonly y: number;
  /** World Z coordinate in metres. */
  readonly z: number;
}

/** World-space ray used for canonical heightfield picking. */
export interface TerrainWorldRay {
  /** Ray origin in world metres. */
  readonly origin: TerrainWorldPoint;
  /** Non-zero world-space direction; normalization is not required. */
  readonly direction: TerrainWorldPoint;
}

/** Nearest forward intersection with one canonical Region heightfield. */
export interface TerrainHeightfieldIntersection extends TerrainWorldPoint {
  /** Stable canonical Region id owning the intersected cell. */
  readonly regionId: string;
}

/** Stable work counters for one heightfield intersection query. */
export interface TerrainHeightfieldIntersectionDiagnostics {
  /** Number of Region AABBs tested. */
  readonly testedRegions: number;
  /** Number of Region AABBs crossed by the forward ray. */
  readonly candidateRegions: number;
  /** Number of height grid cells visited by 2D traversal. */
  readonly visitedCells: number;
  /** Number of canonical heightfield triangles tested. */
  readonly testedTriangles: number;
}

/** Heightfield intersection paired with stable traversal diagnostics. */
export interface TerrainHeightfieldIntersectionQueryResult {
  /** Nearest forward hit, or `null` when every candidate misses. */
  readonly intersection: TerrainHeightfieldIntersection | null;
  /** Work counters independent of total raster area outside the ray path. */
  readonly diagnostics: TerrainHeightfieldIntersectionDiagnostics;
}

/** World X/Z coordinates of one canonical height sample. */
export interface TerrainHeightSampleWorldPosition {
  /** World X coordinate in metres. */
  readonly x: number;
  /** World Z coordinate in metres. */
  readonly z: number;
}

/**
 * Decodes one R16 sample to its canonical world-space height.
 * @param document Region document that defines the independent height range.
 * @param sample Encoded unsigned 16-bit height value.
 * @returns World-space Y coordinate in metres.
 */
export function decodeTerrainHeightSample(document: TerrainProjectDocument, sample: number): number {
  const { minMetres, maxMetres } = document.manifest.heightmap;
  return document.descriptor.worldPosition[1] + minMetres + (sample / UINT16_MAX) * (maxMetres - minMetres);
}

/**
 * Encodes a world-space height through one Region's independent R16 range.
 * @param document Region document that owns the height sample.
 * @param worldHeight World-space Y coordinate in metres.
 * @returns Clamped unsigned 16-bit height value.
 * @throws If `worldHeight` is not finite.
 */
export function encodeTerrainHeightMetres(document: TerrainProjectDocument, worldHeight: number): number {
  if (!Number.isFinite(worldHeight)) throw new Error("Terrain height must be finite");
  const { minMetres, maxMetres } = document.manifest.heightmap;
  const localHeight = worldHeight - document.descriptor.worldPosition[1];
  const normalized = (localHeight - minMetres) / (maxMetres - minMetres);
  return Math.round(Math.min(1, Math.max(0, normalized)) * UINT16_MAX);
}

/**
 * Resolves one row-major sample to its Region-independent world position.
 * @param document Canonical Region document.
 * @param x Zero-based heightmap X column.
 * @param z Zero-based heightmap positive-Z row.
 * @returns World-space X/Z position in metres.
 * @throws If the sample coordinate is outside the Region raster.
 */
export function terrainHeightSampleWorldPosition(
  document: TerrainProjectDocument,
  x: number,
  z: number
): TerrainHeightSampleWorldPosition {
  const [width, height] = document.manifest.heightmap.sampleSize;
  if (!Number.isInteger(x) || x < 0 || x >= width || !Number.isInteger(z) || z < 0 || z >= height) {
    throw new Error(`Terrain height sample (${x}, ${z}) is outside ${width}x${height}`);
  }
  return {
    x: document.descriptor.worldPosition[0] + (x / (width - 1)) * document.descriptor.worldSize[0],
    z: document.descriptor.worldPosition[2] + (z / (height - 1)) * document.descriptor.worldSize[2]
  };
}

/**
 * Samples a canonical Region height with independent X/Z scaling.
 * @param document Canonical Region document containing R16 height samples.
 * @param worldX World X coordinate in metres.
 * @param worldZ World Z coordinate in metres.
 * @returns Bilinearly interpolated world Y, or `null` outside the Region bounds.
 */
export function sampleTerrainDocumentHeight(
  document: TerrainProjectDocument,
  worldX: number,
  worldZ: number
): number | null {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return null;
  const [originX, , originZ] = document.descriptor.worldPosition;
  const [extentX, , extentZ] = document.descriptor.worldSize;
  const localX = worldX - originX;
  const localZ = worldZ - originZ;
  if (localX < 0 || localX > extentX || localZ < 0 || localZ > extentZ) return null;

  const [width, height] = document.manifest.heightmap.sampleSize;
  const sampleX = (localX / extentX) * (width - 1);
  const sampleZ = (localZ / extentZ) * (height - 1);
  const x0 = Math.min(width - 1, Math.floor(sampleX));
  const z0 = Math.min(height - 1, Math.floor(sampleZ));
  const x1 = Math.min(width - 1, x0 + 1);
  const z1 = Math.min(height - 1, z0 + 1);
  const tx = sampleX - x0;
  const tz = sampleZ - z0;
  const h00 = decodeTerrainHeightSample(document, document.heightmap[terrainRasterIndex(x0, z0, width)]);
  const h10 = decodeTerrainHeightSample(document, document.heightmap[terrainRasterIndex(x1, z0, width)]);
  const h01 = decodeTerrainHeightSample(document, document.heightmap[terrainRasterIndex(x0, z1, width)]);
  const h11 = decodeTerrainHeightSample(document, document.heightmap[terrainRasterIndex(x1, z1, width)]);
  const near = h00 + (h10 - h00) * tx;
  const far = h01 + (h11 - h01) * tx;
  return near + (far - near) * tz;
}

/**
 * Intersects a world-space ray with all canonical Region heightfield triangles.
 * @param documents Canonical Region documents in any order.
 * @param ray World-space ray; its direction need not be normalized.
 * @returns Nearest forward hit, or `null` when the ray misses every Region.
 * @throws If the ray contains non-finite values or has a zero direction.
 */
export function intersectTerrainWorldHeightfield(
  documents: readonly TerrainProjectDocument[],
  ray: TerrainWorldRay
): TerrainHeightfieldIntersection | null {
  return intersectTerrainWorldHeightfieldWithDiagnostics(documents, ray).intersection;
}

/**
 * Intersects a world-space ray while reporting Region, cell, and triangle work.
 * @param documents Canonical Region documents in any order.
 * @param ray World-space ray; its direction need not be normalized.
 * @returns Nearest hit and stable traversal counters.
 * @throws If the ray contains non-finite values or has a zero direction.
 */
export function intersectTerrainWorldHeightfieldWithDiagnostics(
  documents: readonly TerrainProjectDocument[],
  ray: TerrainWorldRay
): TerrainHeightfieldIntersectionQueryResult {
  validateRay(ray);
  const diagnostics = { testedRegions: documents.length, candidateRegions: 0, visitedCells: 0, testedTriangles: 0 };
  const candidates = documents
    .map((document) => ({ document, interval: intersectRegionBounds(document, ray) }))
    .filter(
      (candidate): candidate is { document: TerrainProjectDocument; interval: RayInterval } =>
        candidate.interval !== null
    )
    .sort(
      (left, right) =>
        left.interval.enter - right.interval.enter ||
        compareStableStrings(left.document.descriptor.id, right.document.descriptor.id)
    );
  diagnostics.candidateRegions = candidates.length;
  let nearest: { t: number; regionId: string } | null = null;
  for (const candidate of candidates) {
    if (nearest && candidate.interval.enter > nearest.t + INTERSECTION_EPSILON) break;
    const t = intersectDocumentHeightfield(candidate.document, ray, candidate.interval, diagnostics);
    if (
      t !== null &&
      (!nearest ||
        t < nearest.t - INTERSECTION_EPSILON ||
        (Math.abs(t - nearest.t) <= INTERSECTION_EPSILON && candidate.document.descriptor.id < nearest.regionId))
    ) {
      nearest = { t, regionId: candidate.document.descriptor.id };
    }
  }
  return {
    intersection: nearest
      ? {
          regionId: nearest.regionId,
          x: ray.origin.x + ray.direction.x * nearest.t,
          y: ray.origin.y + ray.direction.y * nearest.t,
          z: ray.origin.z + ray.direction.z * nearest.t
        }
      : null,
    diagnostics
  };
}

interface RayInterval {
  enter: number;
  exit: number;
}

interface MutableIntersectionDiagnostics {
  testedRegions: number;
  candidateRegions: number;
  visitedCells: number;
  testedTriangles: number;
}

function intersectRegionBounds(document: TerrainProjectDocument, ray: TerrainWorldRay): RayInterval | null {
  const min = {
    x: document.descriptor.worldPosition[0],
    y: document.descriptor.worldPosition[1] + document.manifest.heightmap.minMetres,
    z: document.descriptor.worldPosition[2]
  };
  const max = {
    x: min.x + document.descriptor.worldSize[0],
    y: document.descriptor.worldPosition[1] + document.manifest.heightmap.maxMetres,
    z: min.z + document.descriptor.worldSize[2]
  };
  let enter = 0;
  let exit = Number.POSITIVE_INFINITY;
  for (const axis of ["x", "y", "z"] as const) {
    const direction = ray.direction[axis];
    const origin = ray.origin[axis];
    if (Math.abs(direction) <= INTERSECTION_EPSILON) {
      if (origin < min[axis] || origin > max[axis]) return null;
      continue;
    }
    let first = (min[axis] - origin) / direction;
    let second = (max[axis] - origin) / direction;
    if (first > second) [first, second] = [second, first];
    enter = Math.max(enter, first);
    exit = Math.min(exit, second);
    if (exit < enter - INTERSECTION_EPSILON) return null;
  }
  return exit >= 0 ? { enter: Math.max(0, enter), exit } : null;
}

function intersectDocumentHeightfield(
  document: TerrainProjectDocument,
  ray: TerrainWorldRay,
  interval: RayInterval,
  diagnostics: MutableIntersectionDiagnostics
): number | null {
  const horizontalDirection = Math.hypot(ray.direction.x, ray.direction.z);
  if (horizontalDirection <= INTERSECTION_EPSILON) {
    return intersectNearVertical(document, ray, interval, diagnostics);
  }

  const [width, height] = document.manifest.heightmap.sampleSize;
  const originX = document.descriptor.worldPosition[0];
  const originZ = document.descriptor.worldPosition[2];
  const cellSizeX = document.descriptor.worldSize[0] / (width - 1);
  const cellSizeZ = document.descriptor.worldSize[2] / (height - 1);
  const startX = ray.origin.x + ray.direction.x * interval.enter;
  const startZ = ray.origin.z + ray.direction.z * interval.enter;
  let cellX = cellIndexAt(startX, originX, cellSizeX, width - 1, ray.direction.x);
  let cellZ = cellIndexAt(startZ, originZ, cellSizeZ, height - 1, ray.direction.z);
  const stepX = Math.sign(ray.direction.x);
  const stepZ = Math.sign(ray.direction.z);
  const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : cellSizeX / Math.abs(ray.direction.x);
  const deltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : cellSizeZ / Math.abs(ray.direction.z);
  let nextX = nextBoundaryParameter(ray.origin.x, ray.direction.x, originX, cellSizeX, cellX, stepX);
  let nextZ = nextBoundaryParameter(ray.origin.z, ray.direction.z, originZ, cellSizeZ, cellZ, stepZ);
  while (nextX < interval.enter - INTERSECTION_EPSILON) nextX += deltaX;
  while (nextZ < interval.enter - INTERSECTION_EPSILON) nextZ += deltaZ;
  let cellEnter = interval.enter;

  while (cellX >= 0 && cellX < width - 1 && cellZ >= 0 && cellZ < height - 1) {
    const cellExit = Math.min(interval.exit, nextX, nextZ);
    const hit = intersectCell(document, ray, cellX, cellZ, diagnostics);
    if (hit !== null && hit >= cellEnter - INTERSECTION_EPSILON && hit <= cellExit + INTERSECTION_EPSILON) {
      return hit;
    }
    if (cellExit >= interval.exit - INTERSECTION_EPSILON) break;
    const advanceX = nextX <= nextZ + INTERSECTION_EPSILON;
    const advanceZ = nextZ <= nextX + INTERSECTION_EPSILON;
    cellEnter = cellExit;
    if (advanceX) {
      cellX += stepX;
      nextX += deltaX;
    }
    if (advanceZ) {
      cellZ += stepZ;
      nextZ += deltaZ;
    }
  }
  return null;
}

function intersectNearVertical(
  document: TerrainProjectDocument,
  ray: TerrainWorldRay,
  interval: RayInterval,
  diagnostics: MutableIntersectionDiagnostics
): number | null {
  const [width, height] = document.manifest.heightmap.sampleSize;
  const originX = document.descriptor.worldPosition[0];
  const originZ = document.descriptor.worldPosition[2];
  const sampleX = ((ray.origin.x - originX) / document.descriptor.worldSize[0]) * (width - 1);
  const sampleZ = ((ray.origin.z - originZ) / document.descriptor.worldSize[2]) * (height - 1);
  const cellsX = neighboringCells(sampleX, width - 1);
  const cellsZ = neighboringCells(sampleZ, height - 1);
  let nearest: number | null = null;
  for (const cellZ of cellsZ) {
    for (const cellX of cellsX) {
      const hit = intersectCell(document, ray, cellX, cellZ, diagnostics);
      if (
        hit !== null &&
        hit >= interval.enter - INTERSECTION_EPSILON &&
        hit <= interval.exit + INTERSECTION_EPSILON &&
        (nearest === null || hit < nearest)
      ) {
        nearest = hit;
      }
    }
  }
  return nearest;
}

function intersectCell(
  document: TerrainProjectDocument,
  ray: TerrainWorldRay,
  x: number,
  z: number,
  diagnostics: MutableIntersectionDiagnostics
): number | null {
  diagnostics.visitedCells++;
  const p00 = samplePoint(document, x, z);
  const p10 = samplePoint(document, x + 1, z);
  const p01 = samplePoint(document, x, z + 1);
  const p11 = samplePoint(document, x + 1, z + 1);
  diagnostics.testedTriangles += 2;
  const first = intersectTriangle(ray, p00, p10, p01);
  const second = intersectTriangle(ray, p10, p11, p01);
  if (first === null) return second;
  if (second === null) return first;
  return Math.min(first, second);
}

function neighboringCells(sampleCoordinate: number, cellCount: number): number[] {
  const clamped = Math.min(cellCount, Math.max(0, sampleCoordinate));
  const rounded = Math.round(clamped);
  if (Math.abs(clamped - rounded) <= INTERSECTION_EPSILON && rounded > 0 && rounded < cellCount) {
    return [rounded - 1, rounded];
  }
  return [Math.min(cellCount - 1, Math.floor(clamped))];
}

function cellIndexAt(
  coordinate: number,
  origin: number,
  cellSize: number,
  cellCount: number,
  direction: number
): number {
  const grid = (coordinate - origin) / cellSize;
  const rounded = Math.round(grid);
  const onBoundary = Math.abs(grid - rounded) <= INTERSECTION_EPSILON;
  const index = onBoundary && direction < 0 ? rounded - 1 : Math.floor(grid);
  return Math.min(cellCount - 1, Math.max(0, index));
}

function nextBoundaryParameter(
  rayOrigin: number,
  rayDirection: number,
  gridOrigin: number,
  cellSize: number,
  cell: number,
  step: number
): number {
  if (step === 0) return Number.POSITIVE_INFINITY;
  const boundary = gridOrigin + (step > 0 ? cell + 1 : cell) * cellSize;
  return (boundary - rayOrigin) / rayDirection;
}

function validateRay(ray: TerrainWorldRay): void {
  const values = [ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z];
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Terrain picking ray must be finite");
  const lengthSquared =
    ray.direction.x * ray.direction.x + ray.direction.y * ray.direction.y + ray.direction.z * ray.direction.z;
  if (lengthSquared <= INTERSECTION_EPSILON * INTERSECTION_EPSILON) {
    throw new Error("Terrain picking ray direction must be non-zero");
  }
}

function samplePoint(document: TerrainProjectDocument, x: number, z: number): TerrainWorldPoint {
  const position = terrainHeightSampleWorldPosition(document, x, z);
  const width = document.manifest.heightmap.sampleSize[0];
  return {
    x: position.x,
    y: decodeTerrainHeightSample(document, document.heightmap[terrainRasterIndex(x, z, width)]),
    z: position.z
  };
}

function intersectTriangle(
  ray: TerrainWorldRay,
  a: TerrainWorldPoint,
  b: TerrainWorldPoint,
  c: TerrainWorldPoint
): number | null {
  const edge1 = subtract(b, a);
  const edge2 = subtract(c, a);
  const crossDirectionEdge2 = cross(ray.direction, edge2);
  const determinant = dot(edge1, crossDirectionEdge2);
  if (Math.abs(determinant) <= INTERSECTION_EPSILON) return null;
  const inverse = 1 / determinant;
  const originOffset = subtract(ray.origin, a);
  const u = dot(originOffset, crossDirectionEdge2) * inverse;
  if (u < -INTERSECTION_EPSILON || u > 1 + INTERSECTION_EPSILON) return null;
  const crossOffsetEdge1 = cross(originOffset, edge1);
  const v = dot(ray.direction, crossOffsetEdge1) * inverse;
  if (v < -INTERSECTION_EPSILON || u + v > 1 + INTERSECTION_EPSILON) return null;
  const t = dot(edge2, crossOffsetEdge1) * inverse;
  return t >= -INTERSECTION_EPSILON ? Math.max(0, t) : null;
}

function subtract(left: TerrainWorldPoint, right: TerrainWorldPoint): TerrainWorldPoint {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function cross(left: TerrainWorldPoint, right: TerrainWorldPoint): TerrainWorldPoint {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x
  };
}

function dot(left: TerrainWorldPoint, right: TerrainWorldPoint): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function compareStableStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
