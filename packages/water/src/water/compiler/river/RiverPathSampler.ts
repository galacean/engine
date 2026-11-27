import { evaluateRiverCatmullRom, evaluateRiverCubicBezier } from "../../authoring/river/RiverCurve";
/**
 * River path sampling.
 *
 * Every authored or published point is an anchor. Length and chord error determine
 * tessellation; explicit budgets reject excess demand instead of removing anchors
 * or coarsening precision. Resolved profiles use Polyline without curve reshaping.
 */
import { Vector3 } from "@galacean/engine-math";
import { RiverPathMode } from "../../authoring/river/RiverAuthoringEnums";
import { RiverAuthoringConfig, RiverPathControlPoint, Vector3Tuple } from "../../authoring/river/RiverAuthoringTypes";
import { RiverDiagnosticCode, RiverDiagnosticSeverity, type RiverDiagnostic } from "../shared/diagnostics";
import { RIVER_FLOW_TRAVEL_MIN_SPEED } from "./constants";
import type { RiverSamplePoint, RiverSampleResult } from "./types";

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

/** Internal network allowances, expressed as sample capacity at the current reach stride. */
export interface RiverPathSamplingLimit {
  readonly maxSampleCount: number;
  readonly path: string;
  readonly remaining: number;
  readonly verticesPerSample?: number;
  readonly reachIndex: number;
}

class SamplingBudgetExceeded extends RangeError {
  constructor(readonly diagnostic: RiverDiagnostic) {
    super(diagnostic.message);
  }
}

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

/** PCHIP slopes in height per horizontal meter. Flat or reversing spans meet with zero slope. */
function elevationSlope(points: ResolvedPathPoint[], index: number): number {
  const secant = (i: number) => {
    const a = points[i].position,
      b = points[i + 1].position;
    const length = Math.max(POSITION_EPSILON, Math.hypot(b.x - a.x, b.z - a.z));
    return { length, slope: (b.y - a.y) / length };
  };
  if (index === 0) return secant(0).slope;
  if (index === points.length - 1) return secant(index - 1).slope;
  const a = secant(index - 1),
    b = secant(index);
  if (a.slope * b.slope <= 0) return 0;
  const w1 = 2 * b.length + a.length,
    w2 = b.length + 2 * a.length;
  return (w1 + w2) / (w1 / a.slope + w2 / b.slope);
}

function sampleMonotoneElevation(points: ResolvedPathPoint[], index: number, t: number): Vector3 {
  const a = points[index].position,
    b = points[index + 1].position;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const m0 = elevationSlope(points, index) * length,
    m1 = elevationSlope(points, index + 1) * length;
  const position = lerpVector3(a, b, t);
  const t2 = t * t,
    t3 = t2 * t;
  position.y = (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * m1;
  return position;
}

function evaluateSpan(points: ResolvedPathPoint[], index: number, mode: RiverPathMode, t: number): CurvePoint {
  const current = points[index];
  const next = points[index + 1];
  let position: Vector3;
  if (t <= 0) {
    position = cloneVector3(current.position);
  } else if (t >= 1) {
    position = cloneVector3(next.position);
  } else if (mode === RiverPathMode.MonotoneElevation) {
    position = sampleMonotoneElevation(points, index, t);
  } else if (mode === RiverPathMode.CatmullRom) {
    position = evaluateRiverCatmullRom(
      points[index - 1]?.position,
      current.position,
      next.position,
      points[index + 2]?.position,
      t
    );
  } else if (mode === RiverPathMode.Bezier) {
    const firstFallback = lerpVector3(current.position, next.position, 1 / 3);
    const secondFallback = lerpVector3(current.position, next.position, 2 / 3);
    position = evaluateRiverCubicBezier(
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
  output: CurvePoint[],
  consumeIntervals: (count: number) => void
): void {
  const range = end.t - start.t;
  const middle = evaluate(start.t + range * 0.5);
  // Every supported smooth span is cubic. Recover its Bezier controls from two
  // interior values; the convex hull gives a conservative chord-error bound.
  const q1 = evaluate(start.t + range / 3).position;
  const q2 = evaluate(start.t + (range * 2) / 3).position;
  const handle = (a: Vector3, b: Vector3, first: Vector3, last: Vector3) =>
    new Vector3(
      3 * a.x - 1.5 * b.x - (5 / 6) * first.x + last.x / 3,
      3 * a.y - 1.5 * b.y - (5 / 6) * first.y + last.y / 3,
      3 * a.z - 1.5 * b.z - (5 / 6) * first.z + last.z / 3
    );
  const chordError = Math.max(
    pointToSegmentDistance(handle(q1, q2, start.position, end.position), start.position, end.position),
    pointToSegmentDistance(handle(q2, q1, end.position, start.position), start.position, end.position)
  );
  const shouldSplit = chordError > maxChordError || distance(start.position, end.position) > maxTableSegmentLength;
  if (shouldSplit) {
    if (middle.t === start.t || middle.t === end.t)
      throw new RangeError("River chord/spacing precision exceeds floating-point subdivision capability.");
    flattenSpan(evaluate, start, middle, maxChordError, maxTableSegmentLength, output, consumeIntervals);
    flattenSpan(evaluate, middle, end, maxChordError, maxTableSegmentLength, output, consumeIntervals);
    return;
  }
  consumeIntervals(1);
  output.push(end);
}

function buildArcSpan(
  points: ResolvedPathPoint[],
  index: number,
  mode: RiverPathMode,
  segmentLength: number,
  maxChordError: number,
  consumeIntervals: (count: number) => void
): ArcSpan {
  const evaluate = (t: number): CurvePoint => evaluateSpan(points, index, mode, t);
  const flattened: CurvePoint[] = [evaluate(0)];
  if (mode === RiverPathMode.Polyline) flattened.push(evaluate(1));
  else flattenSpan(evaluate, flattened[0], evaluate(1), maxChordError, segmentLength, flattened, consumeIntervals);
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

function createSamplePoint(
  point: CurvePoint,
  tangent: Vector3,
  cumulativeDistance: number,
  flowTravelTime: number
): RiverSamplePoint {
  const position = cloneVector3(point.position);
  return {
    position,
    tangent: normalizeXZ(tangent),
    distance: cumulativeDistance,
    flowTravelTime,
    width: point.width,
    depth: point.depth,
    flowSpeed: point.flowSpeed,
    bankFeather: point.bankFeather
  };
}

export function calculateRiverFlowTravelDuration(
  segmentLength: number,
  startFlowSpeed: number,
  endFlowSpeed: number
): number {
  const startReciprocal = 1 / Math.max(startFlowSpeed, RIVER_FLOW_TRAVEL_MIN_SPEED);
  const endReciprocal = 1 / Math.max(endFlowSpeed, RIVER_FLOW_TRAVEL_MIN_SPEED);
  return segmentLength * (startReciprocal + endReciprocal) * 0.5;
}

export function sampleRiverPath(
  config: RiverAuthoringConfig,
  limits: readonly RiverPathSamplingLimit[] = []
): RiverSampleResult {
  const diagnostics: RiverDiagnostic[] = [];
  if (config.path.semantics === "resolved-path" && config.path.mode !== RiverPathMode.Polyline) {
    diagnostics.push({
      code: RiverDiagnosticCode.ValueOutOfRange,
      severity: RiverDiagnosticSeverity.Error,
      path: "path.mode",
      message: "A resolved-path requires Polyline; Water cannot reshape published anchors."
    });
    return { points: [], totalLength: 0, diagnostics };
  }
  const controlPoints = config.path.points.map((point) => resolvePathPoint(point, config));
  if (controlPoints.length < 2) {
    return { points: [], totalLength: 0, diagnostics };
  }
  const geometryQuality = config.quality.geometry;
  // Resolve steep slope transitions before meshing; dividing a polyline cannot round its corners.
  const smoothElevation = config.path.mode === RiverPathMode.MonotoneElevation;
  const segmentLength = config.path.segmentLength * (smoothElevation ? 0.25 : 1);
  const chordError = geometryQuality.maxChordError * (smoothElevation ? 0.1 : 1);
  // One accumulator for the entire reach, shared by every span and recursive leaf.
  let requiredIntervals = 0;
  const consumeIntervals = (count: number): void => {
    requiredIntervals += count;
    const sampleCount = requiredIntervals + 1;
    let limit: RiverPathSamplingLimit | undefined;
    for (const candidate of limits) {
      if (sampleCount > candidate.maxSampleCount) {
        limit = candidate;
        break;
      }
    }
    const ceiling = geometryQuality.maxSegmentCount;
    let path: string;
    let message: string;
    if (limit) {
      path = limit.path;
      const unit = limit.verticesPerSample === undefined ? "samples" : "vertices";
      const conversion =
        limit.verticesPerSample === undefined ? "" : ` at ${limit.verticesPerSample} vertices per sample`;
      message = `River precision requires at least ${sampleCount} samples in reach ${limit.reachIndex}; ${path} remaining allowance is ${limit.remaining} ${unit} (sample capacity ${limit.maxSampleCount}${conversion}).`;
    } else if (
      !Number.isSafeInteger(requiredIntervals) ||
      sampleCount > 0xffffffff ||
      (ceiling !== undefined && requiredIntervals > ceiling)
    ) {
      // Compiled sample references use Uint32 indices, independently of optional quality budgets.
      path = "quality.geometry.maxSegmentCount";
      const reach = limits.length > 0 ? ` in reach ${limits[0].reachIndex}` : "";
      message = `River precision requires at least ${requiredIntervals} segments${reach}; ${
        ceiling !== undefined && requiredIntervals > ceiling
          ? `explicit budget allows ${ceiling}; remaining allowance is ${Math.max(0, ceiling - (requiredIntervals - count))} segments`
          : "Uint32 sample indexing allows 4294967295 samples"
      }.`;
    } else return;
    throw new SamplingBudgetExceeded({
      code: RiverDiagnosticCode.NetworkBudgetExceeded,
      severity: RiverDiagnosticSeverity.Error,
      path,
      message
    });
  };
  const spans: ArcSpan[] = [];
  try {
    for (let index = 0; index < controlPoints.length - 1; index++) {
      const span = buildArcSpan(controlPoints, index, config.path.mode, segmentLength, chordError, consumeIntervals);
      if (config.path.mode === RiverPathMode.Polyline) {
        consumeIntervals(Math.max(1, Math.ceil(span.length / segmentLength)));
      }
      spans.push(span);
    }
  } catch (error) {
    diagnostics.push(
      error instanceof SamplingBudgetExceeded
        ? error.diagnostic
        : {
            code: RiverDiagnosticCode.NetworkBudgetExceeded,
            severity: RiverDiagnosticSeverity.Error,
            path: "path",
            message: String(error)
          }
    );
    return { points: [], totalLength: 0, diagnostics };
  }
  const intervals = spans.map((span) =>
    config.path.mode === RiverPathMode.Polyline
      ? Math.max(1, Math.ceil(span.length / segmentLength))
      : span.points.length - 1
  );
  const curveSamples: CurvePoint[] = [];
  for (let spanIndex = 0; spanIndex < spans.length; spanIndex++) {
    const intervalCount = intervals[spanIndex];
    for (let step = spanIndex === 0 ? 0 : 1; step <= intervalCount; step++) {
      curveSamples.push(
        config.path.mode === RiverPathMode.Polyline
          ? evaluateSpan(controlPoints, spanIndex, config.path.mode, step / intervalCount)
          : spans[spanIndex].points[step]
      );
    }
  }
  const samples: RiverSamplePoint[] = [];
  let totalLength = 0;
  let flowTravelTime = 0;
  for (let i = 0; i < curveSamples.length; i++) {
    const current = curveSamples[i];
    const previous = curveSamples[Math.max(0, i - 1)];
    const next = curveSamples[Math.min(curveSamples.length - 1, i + 1)];
    if (i > 0) {
      const segmentLength = distance(previous.position, current.position);
      totalLength += segmentLength;
      flowTravelTime += calculateRiverFlowTravelDuration(segmentLength, previous.flowSpeed, current.flowSpeed);
    }
    samples.push(
      createSamplePoint(
        current,
        new Vector3(next.position.x - previous.position.x, 0, next.position.z - previous.position.z),
        totalLength,
        flowTravelTime
      )
    );
  }
  return { points: samples, totalLength, diagnostics };
}
