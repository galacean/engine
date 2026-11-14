import type { SeedWorldPoint } from "../world/SeedWorldPlanner.ts";

const CONTOUR_SMOOTHING_PASSES = 3;

/**
 * Converts an Analysis-grid basin outline into a deterministic smooth canonical shoreline.
 * @param contour Closed normalized outline traced from the selected basin cells.
 * @returns A closed, rounded outline whose vertices remain in normalized world coordinates.
 * @throws {RangeError} When fewer than three finite contour points are supplied.
 */
export function compileSeedWorldHydrologyBasinContour(contour: readonly SeedWorldPoint[]): readonly SeedWorldPoint[] {
  if (contour.length < 3 || contour.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new RangeError("Seed World basin contour requires at least three finite points.");
  }
  let smoothed = contour.map((point) => Object.freeze({ x: clamp01(point.x), y: clamp01(point.y) }));
  for (let pass = 0; pass < CONTOUR_SMOOTHING_PASSES; pass++) {
    const next: SeedWorldPoint[] = [];
    for (let index = 0; index < smoothed.length; index++) {
      const current = smoothed[index]!;
      const following = smoothed[(index + 1) % smoothed.length]!;
      next.push(
        Object.freeze({ x: mix(current.x, following.x, 0.25), y: mix(current.y, following.y, 0.25) }),
        Object.freeze({ x: mix(current.x, following.x, 0.75), y: mix(current.y, following.y, 0.75) })
      );
    }
    smoothed = next;
  }
  return Object.freeze(smoothed);
}

/**
 * Samples exact world-metre distance to a canonical basin shoreline.
 * @param contour Closed normalized shoreline returned by `compileSeedWorldHydrologyBasinContour`.
 * @param sizeMetres Physical edge length of the square world.
 * @param normalizedX Normalized world X coordinate.
 * @param normalizedY Normalized world Z coordinate.
 * @returns Negative distance inside the basin and positive distance outside it.
 * @throws {RangeError} When the contour or world extent is invalid.
 */
export function sampleSeedWorldHydrologyBasinSignedDistanceMetres(
  contour: readonly SeedWorldPoint[],
  sizeMetres: number,
  normalizedX: number,
  normalizedY: number
): number {
  if (contour.length < 3) throw new RangeError("Seed World basin distance requires a closed contour.");
  if (!Number.isFinite(sizeMetres) || sizeMetres <= 0) {
    throw new RangeError("Seed World basin distance requires a positive world extent.");
  }
  const pointX = clamp01(normalizedX);
  const pointY = clamp01(normalizedY);
  let inside = false;
  let minimumDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0, previousIndex = contour.length - 1; index < contour.length; previousIndex = index++) {
    const start = contour[previousIndex]!;
    const end = contour[index]!;
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    const ratio =
      lengthSquared === 0
        ? 0
        : clamp01(((pointX - start.x) * segmentX + (pointY - start.y) * segmentY) / lengthSquared);
    const deltaX = pointX - (start.x + segmentX * ratio);
    const deltaY = pointY - (start.y + segmentY * ratio);
    minimumDistanceSquared = Math.min(minimumDistanceSquared, deltaX * deltaX + deltaY * deltaY);
    if (
      start.y > pointY !== end.y > pointY &&
      pointX < ((end.x - start.x) * (pointY - start.y)) / (end.y - start.y) + start.x
    ) {
      inside = !inside;
    }
  }
  const distanceMetres = Math.sqrt(minimumDistanceSquared) * sizeMetres;
  return inside ? -distanceMetres : distanceMetres;
}

/** Sampling lattice used by an exact basin signed-distance field. */
export type SeedWorldHydrologyBasinDistanceLattice = "vertex" | "cell-centre";

/**
 * Rasterizes exact world-metre distance to a canonical basin shoreline.
 * @param contour Closed normalized shoreline returned by `compileSeedWorldHydrologyBasinContour`.
 * @param sizeMetres Physical edge length of the square world.
 * @param resolution Width and height of the square output field.
 * @param lattice Whether samples lie on grid vertices or cell centres.
 * @param output Preallocated row-major storage whose precision is preserved.
 * @returns The populated `output` field.
 * @throws {RangeError} When the contour, world extent, resolution, or output size is invalid.
 */
export function compileSeedWorldHydrologyBasinSignedDistanceField<Output extends Float32Array | Float64Array>(
  contour: readonly SeedWorldPoint[],
  sizeMetres: number,
  resolution: number,
  lattice: SeedWorldHydrologyBasinDistanceLattice,
  output: Output
): Output {
  if (contour.length < 3) throw new RangeError("Seed World basin distance requires a closed contour.");
  if (!Number.isFinite(sizeMetres) || sizeMetres <= 0) {
    throw new RangeError("Seed World basin distance requires a positive world extent.");
  }
  if (!Number.isInteger(resolution) || resolution < 2) {
    throw new RangeError("Seed World basin distance field requires an integer resolution of at least two.");
  }
  if (output.length !== resolution * resolution) {
    throw new RangeError("Seed World basin distance output does not match the requested resolution.");
  }
  const segments = compileContourSegments(contour);
  const sampleOffset = lattice === "cell-centre" ? 0.5 : 0;
  const sampleDivisor = lattice === "cell-centre" ? resolution : resolution - 1;
  const nearestSegmentByColumn = new Int32Array(resolution);
  const nearest = { index: -1, distanceSquared: Number.POSITIVE_INFINITY };
  nearestSegmentByColumn.fill(-1);
  for (let y = 0; y < resolution; y++) {
    const pointY = (y + sampleOffset) / sampleDivisor;
    const intersections = compileContourRowIntersections(segments, pointY);
    let intersectionCursor = 0;
    let nearestSegmentOnLeft = -1;
    for (let x = 0; x < resolution; x++) {
      const pointX = (x + sampleOffset) / sampleDivisor;
      while (intersectionCursor < intersections.length && intersections[intersectionCursor]! <= pointX) {
        intersectionCursor++;
      }
      sampleNearestContourSegment(segments, pointX, pointY, nearestSegmentOnLeft, nearestSegmentByColumn[x]!, nearest);
      nearestSegmentOnLeft = nearest.index;
      nearestSegmentByColumn[x] = nearest.index;
      const distanceMetres = Math.sqrt(nearest.distanceSquared) * sizeMetres;
      output[y * resolution + x] =
        (intersections.length - intersectionCursor) % 2 === 1 ? -distanceMetres : distanceMetres;
    }
  }
  return output;
}

interface PreparedContourSegments {
  readonly count: number;
  readonly startX: Float64Array;
  readonly startY: Float64Array;
  readonly endX: Float64Array;
  readonly endY: Float64Array;
  readonly deltaX: Float64Array;
  readonly deltaY: Float64Array;
  readonly lengthSquared: Float64Array;
  readonly minimumX: Float64Array;
  readonly minimumY: Float64Array;
  readonly maximumX: Float64Array;
  readonly maximumY: Float64Array;
}

function compileContourSegments(contour: readonly SeedWorldPoint[]): PreparedContourSegments {
  const count = contour.length;
  const startX = new Float64Array(count);
  const startY = new Float64Array(count);
  const endX = new Float64Array(count);
  const endY = new Float64Array(count);
  const deltaX = new Float64Array(count);
  const deltaY = new Float64Array(count);
  const lengthSquared = new Float64Array(count);
  const minimumX = new Float64Array(count);
  const minimumY = new Float64Array(count);
  const maximumX = new Float64Array(count);
  const maximumY = new Float64Array(count);
  for (let index = 0, previousIndex = count - 1; index < count; previousIndex = index++) {
    const start = contour[previousIndex]!;
    const end = contour[index]!;
    if (!Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) {
      throw new RangeError("Seed World basin distance requires finite contour points.");
    }
    const clampedStartX = clamp01(start.x);
    const clampedStartY = clamp01(start.y);
    const clampedEndX = clamp01(end.x);
    const clampedEndY = clamp01(end.y);
    const segmentX = clampedEndX - clampedStartX;
    const segmentY = clampedEndY - clampedStartY;
    startX[index] = clampedStartX;
    startY[index] = clampedStartY;
    endX[index] = clampedEndX;
    endY[index] = clampedEndY;
    deltaX[index] = segmentX;
    deltaY[index] = segmentY;
    lengthSquared[index] = segmentX * segmentX + segmentY * segmentY;
    minimumX[index] = Math.min(clampedStartX, clampedEndX);
    minimumY[index] = Math.min(clampedStartY, clampedEndY);
    maximumX[index] = Math.max(clampedStartX, clampedEndX);
    maximumY[index] = Math.max(clampedStartY, clampedEndY);
  }
  return { count, startX, startY, endX, endY, deltaX, deltaY, lengthSquared, minimumX, minimumY, maximumX, maximumY };
}

function compileContourRowIntersections(segments: PreparedContourSegments, pointY: number): number[] {
  const intersections: number[] = [];
  for (let index = 0; index < segments.count; index++) {
    const startY = segments.startY[index]!;
    const endY = segments.endY[index]!;
    if (startY > pointY === endY > pointY) continue;
    intersections.push(
      ((segments.endX[index]! - segments.startX[index]!) * (pointY - startY)) / (endY - startY) +
        segments.startX[index]!
    );
  }
  intersections.sort((left, right) => left - right);
  return intersections;
}

function sampleNearestContourSegment(
  segments: PreparedContourSegments,
  pointX: number,
  pointY: number,
  leftSeed: number,
  upperSeed: number,
  result: { index: number; distanceSquared: number }
): void {
  let nearestIndex = leftSeed >= 0 ? leftSeed : upperSeed;
  let minimumDistanceSquared =
    nearestIndex >= 0
      ? sampleContourSegmentDistanceSquared(segments, nearestIndex, pointX, pointY)
      : Number.POSITIVE_INFINITY;
  if (upperSeed >= 0 && upperSeed !== nearestIndex) {
    const upperDistanceSquared = sampleContourSegmentDistanceSquared(segments, upperSeed, pointX, pointY);
    if (upperDistanceSquared < minimumDistanceSquared) {
      nearestIndex = upperSeed;
      minimumDistanceSquared = upperDistanceSquared;
    }
  }
  for (let index = 0; index < segments.count; index++) {
    if (index === leftSeed || index === upperSeed) continue;
    const boxDeltaX =
      pointX < segments.minimumX[index]!
        ? segments.minimumX[index]! - pointX
        : pointX > segments.maximumX[index]!
          ? pointX - segments.maximumX[index]!
          : 0;
    const boxDeltaY =
      pointY < segments.minimumY[index]!
        ? segments.minimumY[index]! - pointY
        : pointY > segments.maximumY[index]!
          ? pointY - segments.maximumY[index]!
          : 0;
    if (boxDeltaX * boxDeltaX + boxDeltaY * boxDeltaY >= minimumDistanceSquared) continue;
    const distanceSquared = sampleContourSegmentDistanceSquared(segments, index, pointX, pointY);
    if (distanceSquared < minimumDistanceSquared) {
      nearestIndex = index;
      minimumDistanceSquared = distanceSquared;
    }
  }
  result.index = nearestIndex;
  result.distanceSquared = minimumDistanceSquared;
}

function sampleContourSegmentDistanceSquared(
  segments: PreparedContourSegments,
  index: number,
  pointX: number,
  pointY: number
): number {
  const segmentX = segments.deltaX[index]!;
  const segmentY = segments.deltaY[index]!;
  const segmentLengthSquared = segments.lengthSquared[index]!;
  const ratio =
    segmentLengthSquared === 0
      ? 0
      : clamp01(
          ((pointX - segments.startX[index]!) * segmentX + (pointY - segments.startY[index]!) * segmentY) /
            segmentLengthSquared
        );
  const deltaX = pointX - (segments.startX[index]! + segmentX * ratio);
  const deltaY = pointY - (segments.startY[index]! + segmentY * ratio);
  return deltaX * deltaX + deltaY * deltaY;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
