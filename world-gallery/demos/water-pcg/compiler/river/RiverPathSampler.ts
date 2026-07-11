/**
 * River path sampling.
 *
 * Every authored control point is an anchor: sampling and mobile budgets may
 * change density, but never remove an anchor or the segment endpoints. Curves are
 * first flattened adaptively, then sampled through an arc-length table so
 * segmentLength is a world-space contract instead of a parametric-t estimate.
 */
import { Vector3 } from "@galacean/engine-math";
import { RiverPathMode } from "../../authoring/river/RiverAuthoringEnums";
import { RiverAuthoringConfig, RiverPathControlPoint, Vector3Tuple } from "../../authoring/river/RiverAuthoringTypes";
import { RiverDiagnosticCode, RiverDiagnosticSeverity, type RiverDiagnostic } from "../shared/diagnostics";
import type { RiverSamplePoint, RiverSampleResult, TerrainHeightSampler } from "./types";

interface ResolvedPathPoint {
  source: RiverPathControlPoint;
  position: Vector3;
  width: number;
  depth: number;
  flowSpeed: number;
  bankFeather: number;
}

interface CurvePoint {
  position: Vector3;
  t: number;
  width: number;
  depth: number;
  flowSpeed: number;
  bankFeather: number;
}

interface ArcPoint extends CurvePoint {
  distance: number;
}

interface ArcSpan {
  points: ArcPoint[];
  length: number;
}

const ADAPTIVE_MAX_DEPTH = 12;
const POSITION_EPSILON = 0.0001;

function tupleToVector3(point: Vector3Tuple): Vector3 {
  return new Vector3(point[0], point[1], point[2]);
}

function cloneVector3(point: Vector3): Vector3 {
  return new Vector3(point.x, point.y, point.z);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVector3(a: Vector3, b: Vector3, t: number): Vector3 {
  return new Vector3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
}

function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

function sampleCatmullRom(points: ResolvedPathPoint[], index: number, t: number): Vector3 {
  const p0 = points[Math.max(index - 1, 0)];
  const p1 = points[index];
  const p2 = points[Math.min(index + 1, points.length - 1)];
  const p3 = points[Math.min(index + 2, points.length - 1)];
  return new Vector3(
    catmullRom(p0.position.x, p1.position.x, p2.position.x, p3.position.x, t),
    catmullRom(p0.position.y, p1.position.y, p2.position.y, p3.position.y, t),
    catmullRom(p0.position.z, p1.position.z, p2.position.z, p3.position.z, t)
  );
}

function sampleCubicBezier(a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: number): Vector3 {
  const oneMinusT = 1 - t;
  const oneMinusT2 = oneMinusT * oneMinusT;
  const t2 = t * t;
  return new Vector3(
    a.x * oneMinusT2 * oneMinusT + b.x * 3 * oneMinusT2 * t + c.x * 3 * oneMinusT * t2 + d.x * t2 * t,
    a.y * oneMinusT2 * oneMinusT + b.y * 3 * oneMinusT2 * t + c.y * 3 * oneMinusT * t2 + d.y * t2 * t,
    a.z * oneMinusT2 * oneMinusT + b.z * 3 * oneMinusT2 * t + c.z * 3 * oneMinusT * t2 + d.z * t2 * t
  );
}

function distance(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function pointToSegmentDistance(point: Vector3, a: Vector3, b: Vector3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lengthSquared = abx * abx + aby * aby + abz * abz;
  if (lengthSquared < POSITION_EPSILON * POSITION_EPSILON) {
    return distance(point, a);
  }
  const t = Math.min(
    1,
    Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby + (point.z - a.z) * abz) / lengthSquared)
  );
  return distance(point, new Vector3(a.x + abx * t, a.y + aby * t, a.z + abz * t));
}

function normalizeXZ(vector: Vector3): Vector3 {
  const length = Math.sqrt(vector.x * vector.x + vector.z * vector.z);
  return length < POSITION_EPSILON ? new Vector3(0, 0, 1) : new Vector3(vector.x / length, 0, vector.z / length);
}

function resolveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function resolvePathPoint(point: RiverPathControlPoint, config: RiverAuthoringConfig): ResolvedPathPoint {
  return {
    source: point,
    position: tupleToVector3(point.position),
    width: resolveNumber(point.width, config.shape.width),
    depth: resolveNumber(point.depth, config.shape.depth),
    flowSpeed: resolveNumber(point.flowSpeed, config.flow.speed),
    bankFeather: resolveNumber(point.bankFeather, config.shape.bankFeather)
  };
}

function getBezierHandle(anchor: ResolvedPathPoint, fallback: Vector3, offset?: Vector3Tuple): Vector3 {
  return offset
    ? new Vector3(anchor.position.x + offset[0], anchor.position.y + offset[1], anchor.position.z + offset[2])
    : fallback;
}

function evaluateSpan(points: ResolvedPathPoint[], index: number, mode: RiverPathMode, t: number): CurvePoint {
  const current = points[index];
  const next = points[index + 1];
  let position: Vector3;
  if (t <= 0) {
    position = cloneVector3(current.position);
  } else if (t >= 1) {
    position = cloneVector3(next.position);
  } else if (mode === RiverPathMode.CatmullRom) {
    position = sampleCatmullRom(points, index, t);
  } else if (mode === RiverPathMode.Bezier) {
    const firstFallback = lerpVector3(current.position, next.position, 1 / 3);
    const secondFallback = lerpVector3(current.position, next.position, 2 / 3);
    position = sampleCubicBezier(
      current.position,
      getBezierHandle(current, firstFallback, current.source.out),
      getBezierHandle(next, secondFallback, next.source.in),
      next.position,
      t
    );
  } else {
    position = lerpVector3(current.position, next.position, t);
  }
  return {
    position,
    t,
    width: lerp(current.width, next.width, t),
    depth: lerp(current.depth, next.depth, t),
    flowSpeed: lerp(current.flowSpeed, next.flowSpeed, t),
    bankFeather: lerp(current.bankFeather, next.bankFeather, t)
  };
}

function flattenSpan(
  evaluate: (t: number) => CurvePoint,
  start: CurvePoint,
  end: CurvePoint,
  maxChordError: number,
  maxTableSegmentLength: number,
  depth: number,
  output: CurvePoint[]
): void {
  const range = end.t - start.t;
  const quarter = evaluate(start.t + range * 0.25);
  const middle = evaluate(start.t + range * 0.5);
  const threeQuarter = evaluate(start.t + range * 0.75);
  const chordError = Math.max(
    pointToSegmentDistance(quarter.position, start.position, end.position),
    pointToSegmentDistance(middle.position, start.position, end.position),
    pointToSegmentDistance(threeQuarter.position, start.position, end.position)
  );
  const shouldSplit =
    depth < ADAPTIVE_MAX_DEPTH &&
    (chordError > maxChordError || distance(start.position, end.position) > maxTableSegmentLength);
  if (shouldSplit) {
    flattenSpan(evaluate, start, middle, maxChordError, maxTableSegmentLength, depth + 1, output);
    flattenSpan(evaluate, middle, end, maxChordError, maxTableSegmentLength, depth + 1, output);
    return;
  }
  output.push(end);
}

function buildArcSpan(
  points: ResolvedPathPoint[],
  index: number,
  mode: RiverPathMode,
  segmentLength: number,
  maxChordError: number
): ArcSpan {
  const evaluate = (t: number): CurvePoint => evaluateSpan(points, index, mode, t);
  const flattened: CurvePoint[] = [evaluate(0)];
  flattenSpan(
    evaluate,
    flattened[0],
    evaluate(1),
    maxChordError,
    Math.max(segmentLength * 0.5, maxChordError),
    0,
    flattened
  );
  const arcPoints: ArcPoint[] = [];
  let totalLength = 0;
  for (let i = 0; i < flattened.length; i++) {
    if (i > 0) {
      totalLength += distance(flattened[i - 1].position, flattened[i].position);
    }
    arcPoints.push({ ...flattened[i], distance: totalLength });
  }
  return { points: arcPoints, length: totalLength };
}

function sampleArcSpan(span: ArcSpan, targetDistance: number): CurvePoint {
  if (targetDistance <= 0) {
    return span.points[0];
  }
  if (targetDistance >= span.length) {
    return span.points[span.points.length - 1];
  }
  for (let i = 1; i < span.points.length; i++) {
    const current = span.points[i];
    if (current.distance < targetDistance) {
      continue;
    }
    const previous = span.points[i - 1];
    const localLength = current.distance - previous.distance;
    const t = localLength > POSITION_EPSILON ? (targetDistance - previous.distance) / localLength : 0;
    return {
      position: lerpVector3(previous.position, current.position, t),
      t: lerp(previous.t, current.t, t),
      width: lerp(previous.width, current.width, t),
      depth: lerp(previous.depth, current.depth, t),
      flowSpeed: lerp(previous.flowSpeed, current.flowSpeed, t),
      bankFeather: lerp(previous.bankFeather, current.bankFeather, t)
    };
  }
  return span.points[span.points.length - 1];
}

function allocateIntervals(spans: ArcSpan[], segmentLength: number, maxSegmentCount: number): number[] {
  const desired = spans.map((span) => Math.max(1, Math.ceil(span.length / segmentLength)));
  const desiredTotal = desired.reduce((sum, count) => sum + count, 0);
  const minimum = spans.length;
  const budget = Math.max(minimum, Math.floor(maxSegmentCount));
  if (desiredTotal <= budget) {
    return desired;
  }
  const result = spans.map(() => 1);
  let remaining = budget - minimum;
  const totalLength = spans.reduce((sum, span) => sum + span.length, 0);
  const fractions: Array<{ index: number; fraction: number }> = [];
  for (let i = 0; i < spans.length; i++) {
    const exact =
      totalLength > POSITION_EPSILON ? (remaining * spans[i].length) / totalLength : remaining / spans.length;
    const extra = Math.min(desired[i] - 1, Math.floor(exact));
    result[i] += extra;
    remaining -= extra;
    fractions.push({ index: i, fraction: exact - Math.floor(exact) });
  }
  fractions.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  while (remaining > 0) {
    let allocated = false;
    for (let i = 0; i < fractions.length && remaining > 0; i++) {
      const index = fractions[i].index;
      if (result[index] < desired[index]) {
        result[index]++;
        remaining--;
        allocated = true;
      }
    }
    if (!allocated) {
      break;
    }
  }
  return result;
}

function createSamplePoint(
  point: CurvePoint,
  tangent: Vector3,
  cumulativeDistance: number,
  heightSampler?: TerrainHeightSampler
): RiverSamplePoint {
  const position = cloneVector3(point.position);
  if (heightSampler) {
    position.y = heightSampler.getHeight(position.x, position.z);
  }
  return {
    position,
    tangent: normalizeXZ(tangent),
    distance: cumulativeDistance,
    width: point.width,
    depth: point.depth,
    flowSpeed: point.flowSpeed,
    bankFeather: point.bankFeather
  };
}

export function sampleRiverPath(config: RiverAuthoringConfig, heightSampler?: TerrainHeightSampler): RiverSampleResult {
  const diagnostics: RiverDiagnostic[] = [];
  const controlPoints = config.path.points.map((point) => resolvePathPoint(point, config));
  if (controlPoints.length < 2) {
    return { points: [], totalLength: 0, diagnostics };
  }
  const geometryQuality = config.quality.geometry;
  const spans = controlPoints
    .slice(0, -1)
    .map((_, index) =>
      buildArcSpan(controlPoints, index, config.path.mode, config.path.segmentLength, geometryQuality.maxChordError)
    );
  const desiredSegmentCount = spans.reduce(
    (sum, span) => sum + Math.max(1, Math.ceil(span.length / config.path.segmentLength)),
    0
  );
  if (geometryQuality.maxSegmentCount < spans.length) {
    diagnostics.push({
      code: RiverDiagnosticCode.SamplingBudgetBelowAnchorCount,
      severity: RiverDiagnosticSeverity.Warning,
      path: "quality.geometry.maxSegmentCount",
      message: `Budget ${geometryQuality.maxSegmentCount} is below the ${spans.length} segments required to preserve all anchors.`
    });
  } else if (desiredSegmentCount > geometryQuality.maxSegmentCount) {
    diagnostics.push({
      code: RiverDiagnosticCode.SamplingBudgetRedistributed,
      severity: RiverDiagnosticSeverity.Info,
      path: "quality.geometry.maxSegmentCount",
      message: `Resampled the full path from ${desiredSegmentCount} to ${geometryQuality.maxSegmentCount} segments.`
    });
  }
  const intervals = allocateIntervals(spans, config.path.segmentLength, geometryQuality.maxSegmentCount);
  const curveSamples: CurvePoint[] = [];
  for (let spanIndex = 0; spanIndex < spans.length; spanIndex++) {
    const intervalCount = intervals[spanIndex];
    for (let step = spanIndex === 0 ? 0 : 1; step <= intervalCount; step++) {
      curveSamples.push(
        step === intervalCount
          ? spans[spanIndex].points[spans[spanIndex].points.length - 1]
          : sampleArcSpan(spans[spanIndex], (spans[spanIndex].length * step) / intervalCount)
      );
    }
  }
  const samples: RiverSamplePoint[] = [];
  let totalLength = 0;
  for (let i = 0; i < curveSamples.length; i++) {
    const current = curveSamples[i];
    const previous = curveSamples[Math.max(0, i - 1)];
    const next = curveSamples[Math.min(curveSamples.length - 1, i + 1)];
    if (i > 0) {
      totalLength += distance(previous.position, current.position);
    }
    samples.push(
      createSamplePoint(
        current,
        new Vector3(next.position.x - previous.position.x, 0, next.position.z - previous.position.z),
        totalLength,
        heightSampler
      )
    );
  }
  return { points: samples, totalLength, diagnostics };
}
