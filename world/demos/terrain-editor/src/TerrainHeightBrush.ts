import type { TerrainProjectDocument } from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import { terrainRasterIndex } from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";
import { decodeTerrainHeightSample, encodeTerrainHeightMetres } from "@galacean/engine-world-planning/authoring/terrain/TerrainHeightfield";

const PATH_EPSILON_METRES = 1e-9;

/** World X/Z point captured from one pointer path. */
export interface TerrainHeightBrushPoint {
  /** World X coordinate in metres. */
  readonly x: number;
  /** World Z coordinate in metres. */
  readonly z: number;
}

/** Complete renderer-independent input for one atomic height stroke. */
export interface TerrainHeightBrushStroke {
  /** Ordered pointer path in world metres; one point represents one stationary stamp. */
  readonly points: readonly TerrainHeightBrushPoint[];
  /** Fixed world-space distance between generated brush stamps. */
  readonly spacingMetres: number;
  /** Circular brush radius in world metres. */
  readonly radiusMetres: number;
  /** Maximum signed-magnitude height change in metres. */
  readonly strengthMetres: number;
  /** Whether the stroke raises or lowers source samples. */
  readonly direction: "raise" | "lower";
  /** Radial falloff exponent; `0` is constant and `1` is linear. */
  readonly falloff: number;
}

/** Exact sparse R16 change produced for one sample. */
export interface TerrainHeightBrushSampleChange {
  /** Row-major X-fast sample index. */
  readonly index: number;
  /** Exact source R16 value. */
  readonly before: number;
  /** Exact edited R16 value. */
  readonly after: number;
}

/** Immutable result of applying one stroke to one Region. */
export interface TerrainHeightBrushResult {
  /** Complete edited R16 raster; unchanged results retain the source view. */
  readonly heightmap: Uint16Array;
  /** Changed samples in ascending row-major order. */
  readonly changes: readonly TerrainHeightBrushSampleChange[];
  /** Work counters exposing whether the edit stayed local to the brush bounds. */
  readonly diagnostics: TerrainHeightBrushDiagnostics;
}

/** Stable work counters for one Region brush application. */
export interface TerrainHeightBrushDiagnostics {
  /** Number of fixed-distance stamps evaluated against this Region. */
  readonly stampCount: number;
  /** Number of samples visited inside stamp-local bounding rectangles. */
  readonly visitedSamples: number;
  /** Number of unique samples inside at least one circular stamp. */
  readonly affectedSamples: number;
}

/** Compact Region-local R16 rectangle changed by one incremental brush update. */
export interface TerrainHeightBrushPatch {
  /** Zero-based Region-local sample origin `[x,z]`. */
  readonly sampleOrigin: readonly [x: number, z: number];
  /** Positive compact rectangle dimensions `[width,height]`. */
  readonly sampleSize: readonly [width: number, height: number];
  /** X-fast row-major R16 values after this update. */
  readonly samples: Uint16Array;
}

/** Brush settings retained throughout one interactive stroke session. */
export type TerrainHeightBrushSessionSettings = Omit<TerrainHeightBrushStroke, "points">;

/** Completed interactive stroke with exact stamps used for seam projection. */
export interface TerrainHeightBrushSessionResult extends TerrainHeightBrushResult {
  /** Fixed-distance world-space stamps applied exactly once. */
  readonly stamps: readonly TerrainHeightBrushPoint[];
}

/** Mutable working-copy session used while one pointer stroke is in progress. */
export interface TerrainHeightBrushSession {
  /**
   * Applies every fixed-distance stamp reached by a new pointer point.
   * @param point Latest world-space pointer position.
   * @returns Compact changed rectangle, or `null` before the next stamp interval.
   * @throws If the session is already finished or the point is invalid.
   */
  appendPoint(point: TerrainHeightBrushPoint): TerrainHeightBrushPatch | null;

  /**
   * Applies the final pointer endpoint once and closes the working session.
   * @returns Complete edited raster, exact sparse changes, diagnostics, and applied stamps.
   * @throws If the session was already finished.
   */
  finish(): TerrainHeightBrushSessionResult;

  /**
   * Closes the session without publishing its working copy.
   * @returns Compact baseline rectangle needed to restore a live preview, or `null` when unchanged.
   * @throws If the session was already finished.
   */
  cancel(): TerrainHeightBrushPatch | null;
}

/**
 * Starts one renderer-independent height stroke against a single immutable source raster.
 * @param document Canonical Region document whose heightmap is cloned once for the session.
 * @param settings Fixed brush configuration retained for all incremental points.
 * @returns Working-copy session that never mutates the canonical source document.
 * @throws If any brush setting is invalid.
 */
export function createTerrainHeightBrushSession(
  document: TerrainProjectDocument,
  settings: TerrainHeightBrushSessionSettings
): TerrainHeightBrushSession {
  validateTerrainHeightBrushStroke({ ...settings, points: [{ x: 0, z: 0 }] });
  return new IncrementalTerrainHeightBrushSession(document, settings);
}

/**
 * Resamples one pointer polyline at a fixed accumulated world-space interval.
 * @param points Ordered pointer positions in world metres.
 * @param spacingMetres Positive stamp interval in world metres.
 * @returns Detached stamps including both path endpoints without duplicate positions.
 * @throws If coordinates or spacing are invalid, or the path is empty.
 */
export function resampleTerrainHeightBrushPath(
  points: readonly TerrainHeightBrushPoint[],
  spacingMetres: number
): readonly TerrainHeightBrushPoint[] {
  if (!Number.isFinite(spacingMetres) || spacingMetres <= 0) {
    throw new Error("Terrain height brush spacingMetres must be positive and finite");
  }
  if (points.length === 0) throw new Error("Terrain height brush requires at least one point");
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      throw new Error("Terrain height brush points must be finite");
    }
  }

  const stamps: TerrainHeightBrushPoint[] = [{ x: points[0].x, z: points[0].z }];
  let cursor = stamps[0];
  let distanceUntilStamp = spacingMetres;
  for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
    const endpoint = points[pointIndex];
    let dx = endpoint.x - cursor.x;
    let dz = endpoint.z - cursor.z;
    let segmentLength = Math.hypot(dx, dz);
    if (segmentLength <= PATH_EPSILON_METRES) {
      cursor = { x: endpoint.x, z: endpoint.z };
      continue;
    }
    while (segmentLength + PATH_EPSILON_METRES >= distanceUntilStamp) {
      const ratio = distanceUntilStamp / segmentLength;
      cursor = { x: cursor.x + dx * ratio, z: cursor.z + dz * ratio };
      if (distanceSquared(cursor, stamps[stamps.length - 1]) > PATH_EPSILON_METRES * PATH_EPSILON_METRES) {
        stamps.push(cursor);
      }
      dx = endpoint.x - cursor.x;
      dz = endpoint.z - cursor.z;
      segmentLength = Math.hypot(dx, dz);
      distanceUntilStamp = spacingMetres;
      if (segmentLength <= PATH_EPSILON_METRES) break;
    }
    if (segmentLength > PATH_EPSILON_METRES) distanceUntilStamp -= segmentLength;
    cursor = { x: endpoint.x, z: endpoint.z };
  }

  const endpoint = points[points.length - 1];
  if (distanceSquared(endpoint, stamps[stamps.length - 1]) > PATH_EPSILON_METRES * PATH_EPSILON_METRES) {
    stamps.push({ x: endpoint.x, z: endpoint.z });
  }
  return stamps;
}

/**
 * Resolves the accumulated signed world-height delta from one stroke's fixed-distance stamps.
 * @param stroke Valid height-brush configuration.
 * @param stamps Fixed-distance stamps generated from `stroke.points`.
 * @param worldX Sample world X coordinate in metres.
 * @param worldZ Sample world Z coordinate in metres.
 * @returns Signed height delta in metres; every distinct resampled stamp contributes once.
 */
export function terrainHeightBrushDeltaAt(
  stroke: TerrainHeightBrushStroke,
  stamps: readonly TerrainHeightBrushPoint[],
  worldX: number,
  worldZ: number
): number {
  let accumulated = 0;
  const radiusSquared = stroke.radiusMetres * stroke.radiusMetres;
  for (const stamp of stamps) {
    accumulated += brushStampInfluence(stroke, stamp, worldX, worldZ, radiusSquared);
  }
  const sign = stroke.direction === "raise" ? 1 : -1;
  return sign * stroke.strengthMetres * accumulated;
}

/**
 * Applies one stroke to a Region against an immutable source raster.
 * @param document Canonical Region document and source samples.
 * @param stroke Renderer-independent world-space stroke.
 * @returns Detached edited raster plus exact sparse before/after values.
 * @throws If the stroke configuration is invalid.
 */
export function applyTerrainHeightBrush(
  document: TerrainProjectDocument,
  stroke: TerrainHeightBrushStroke
): TerrainHeightBrushResult {
  validateTerrainHeightBrushStroke(stroke);
  const session = createTerrainHeightBrushSession(document, stroke);
  for (const point of stroke.points) session.appendPoint(point);
  const { heightmap, changes, diagnostics } = session.finish();
  return { heightmap, changes, diagnostics };
}

/**
 * Validates one complete height-brush input before Region dispatch.
 * @param stroke Renderer-independent stroke to validate.
 * @returns Nothing.
 * @throws If any brush parameter, point, or direction is invalid.
 */
export function validateTerrainHeightBrushStroke(stroke: TerrainHeightBrushStroke): void {
  resampleTerrainHeightBrushPath(stroke.points, stroke.spacingMetres);
  if (!Number.isFinite(stroke.radiusMetres) || stroke.radiusMetres <= 0) {
    throw new Error("Terrain height brush radiusMetres must be positive and finite");
  }
  if (!Number.isFinite(stroke.strengthMetres) || stroke.strengthMetres <= 0) {
    throw new Error("Terrain height brush strengthMetres must be positive and finite");
  }
  if (!Number.isFinite(stroke.falloff) || stroke.falloff < 0) {
    throw new Error("Terrain height brush falloff must be finite and non-negative");
  }
  if (stroke.direction !== "raise" && stroke.direction !== "lower") {
    throw new Error(`Unsupported Terrain height brush direction "${String(stroke.direction)}"`);
  }
}

function distanceSquared(left: TerrainHeightBrushPoint, right: TerrainHeightBrushPoint): number {
  const dx = left.x - right.x;
  const dz = left.z - right.z;
  return dx * dx + dz * dz;
}

function clampSampleIndex(index: number, count: number): number {
  return Math.min(count - 1, Math.max(0, index));
}

function brushStampInfluence(
  stroke: TerrainHeightBrushStroke,
  stamp: TerrainHeightBrushPoint,
  worldX: number,
  worldZ: number,
  radiusSquared: number
): number {
  const dx = worldX - stamp.x;
  const dz = worldZ - stamp.z;
  const distanceSquaredToStamp = dx * dx + dz * dz;
  if (distanceSquaredToStamp > radiusSquared) return 0;
  const normalized = 1 - Math.sqrt(distanceSquaredToStamp) / stroke.radiusMetres;
  return stroke.falloff === 0 ? 1 : Math.pow(normalized, stroke.falloff);
}

class IncrementalTerrainHeightBrushSession implements TerrainHeightBrushSession {
  private readonly _workingHeightmap: Uint16Array;
  private readonly _influenceByIndex = new Map<number, number>();
  private readonly _affectedIndices = new Set<number>();
  private readonly _stamps: TerrainHeightBrushPoint[] = [];
  private _lastPoint: TerrainHeightBrushPoint | null = null;
  private _lastStamp: TerrainHeightBrushPoint | null = null;
  private _distanceSinceStamp = 0;
  private _visitedSamples = 0;
  private _finished = false;

  constructor(
    private readonly _document: TerrainProjectDocument,
    private readonly _settings: TerrainHeightBrushSessionSettings
  ) {
    this._workingHeightmap = _document.heightmap.slice();
  }

  appendPoint(point: TerrainHeightBrushPoint): TerrainHeightBrushPatch | null {
    this._assertOpen();
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      throw new Error("Terrain height brush points must be finite");
    }
    const nextPoint = { x: point.x, z: point.z };
    const changed = new Set<number>();
    if (!this._lastPoint) {
      this._lastPoint = nextPoint;
      this._applyStamp(nextPoint, changed);
      return createHeightPatch(this._workingHeightmap, this._document.manifest.heightmap.sampleSize, changed);
    }

    let cursor = this._lastPoint;
    let dx = nextPoint.x - cursor.x;
    let dz = nextPoint.z - cursor.z;
    let segmentLength = Math.hypot(dx, dz);
    while (segmentLength > PATH_EPSILON_METRES) {
      const distanceUntilStamp = this._settings.spacingMetres - this._distanceSinceStamp;
      if (segmentLength + PATH_EPSILON_METRES < distanceUntilStamp) {
        this._distanceSinceStamp += segmentLength;
        break;
      }
      const ratio = Math.min(1, distanceUntilStamp / segmentLength);
      cursor = { x: cursor.x + dx * ratio, z: cursor.z + dz * ratio };
      this._applyStamp(cursor, changed);
      this._distanceSinceStamp = 0;
      dx = nextPoint.x - cursor.x;
      dz = nextPoint.z - cursor.z;
      segmentLength = Math.hypot(dx, dz);
    }
    this._lastPoint = nextPoint;
    return createHeightPatch(this._workingHeightmap, this._document.manifest.heightmap.sampleSize, changed);
  }

  finish(): TerrainHeightBrushSessionResult {
    this._assertOpen();
    if (!this._lastPoint) throw new Error("Terrain height brush session requires at least one point");
    if (!this._lastStamp || distanceSquared(this._lastPoint, this._lastStamp) > PATH_EPSILON_METRES ** 2) {
      this._applyStamp(this._lastPoint, new Set());
    }
    this._finished = true;
    const changes: TerrainHeightBrushSampleChange[] = [];
    for (const index of [...this._affectedIndices].sort((left, right) => left - right)) {
      const before = this._document.heightmap[index];
      const after = this._workingHeightmap[index];
      if (before !== after) changes.push({ index, before, after });
    }
    return {
      heightmap: changes.length > 0 ? this._workingHeightmap : this._document.heightmap,
      changes,
      diagnostics: {
        stampCount: this._stamps.length,
        visitedSamples: this._visitedSamples,
        affectedSamples: this._affectedIndices.size
      },
      stamps: this._stamps.map((stamp) => ({ ...stamp }))
    };
  }

  cancel(): TerrainHeightBrushPatch | null {
    this._assertOpen();
    this._finished = true;
    return createHeightPatch(
      this._document.heightmap,
      this._document.manifest.heightmap.sampleSize,
      this._affectedIndices
    );
  }

  private _applyStamp(stamp: TerrainHeightBrushPoint, changed: Set<number>): void {
    if (this._lastStamp && distanceSquared(stamp, this._lastStamp) <= PATH_EPSILON_METRES ** 2) return;
    const [width, height] = this._document.manifest.heightmap.sampleSize;
    const originX = this._document.descriptor.worldPosition[0];
    const originZ = this._document.descriptor.worldPosition[2];
    const extentX = this._document.descriptor.worldSize[0];
    const extentZ = this._document.descriptor.worldSize[2];
    const radius = this._settings.radiusMetres;
    const minX = clampSampleIndex(Math.ceil(((stamp.x - radius - originX) / extentX) * (width - 1)), width);
    const maxX = clampSampleIndex(Math.floor(((stamp.x + radius - originX) / extentX) * (width - 1)), width);
    const minZ = clampSampleIndex(Math.ceil(((stamp.z - radius - originZ) / extentZ) * (height - 1)), height);
    const maxZ = clampSampleIndex(Math.floor(((stamp.z + radius - originZ) / extentZ) * (height - 1)), height);
    const stroke: TerrainHeightBrushStroke = { ...this._settings, points: [stamp] };
    const radiusSquared = radius * radius;
    if (minX <= maxX && minZ <= maxZ) {
      for (let z = minZ; z <= maxZ; z++) {
        const worldZ = originZ + (z / (height - 1)) * extentZ;
        for (let x = minX; x <= maxX; x++) {
          this._visitedSamples++;
          const worldX = originX + (x / (width - 1)) * extentX;
          const influence = brushStampInfluence(stroke, stamp, worldX, worldZ, radiusSquared);
          if (influence === 0) continue;
          const index = terrainRasterIndex(x, z, width);
          const accumulated = (this._influenceByIndex.get(index) ?? 0) + influence;
          this._influenceByIndex.set(index, accumulated);
          this._affectedIndices.add(index);
          const before = this._document.heightmap[index];
          const signedStrength = this._settings.direction === "raise" ? this._settings.strengthMetres : -this._settings.strengthMetres;
          const after = encodeTerrainHeightMetres(
            this._document,
            decodeTerrainHeightSample(this._document, before) + signedStrength * accumulated
          );
          if (after === this._workingHeightmap[index]) continue;
          this._workingHeightmap[index] = after;
          changed.add(index);
        }
      }
    }
    const applied = { x: stamp.x, z: stamp.z };
    this._lastStamp = applied;
    this._stamps.push(applied);
  }

  private _assertOpen(): void {
    if (this._finished) throw new Error("Terrain height brush session is already finished");
  }
}

function createHeightPatch(
  heightmap: Uint16Array,
  sampleSize: readonly [width: number, height: number],
  indices: ReadonlySet<number>
): TerrainHeightBrushPatch | null {
  if (indices.size === 0) return null;
  const [sampleWidth] = sampleSize;
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const index of indices) {
    const x = index % sampleWidth;
    const z = Math.floor(index / sampleWidth);
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  const width = maxX - minX + 1;
  const height = maxZ - minZ + 1;
  const samples = new Uint16Array(width * height);
  for (let z = 0; z < height; z++) {
    const sourceStart = (minZ + z) * sampleWidth + minX;
    samples.set(heightmap.subarray(sourceStart, sourceStart + width), z * width);
  }
  return {
    sampleOrigin: [minX, minZ],
    sampleSize: [width, height],
    samples
  };
}
