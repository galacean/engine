/**
 * River path sampling.
 *
 * This file converts a small set of authoring control points into a dense,
 * distance-aware centerline used by every downstream water feature. Mesh ribbons,
 * flow UVs, debug arrows, water queries, and future terrain fitting all depend on
 * stable sample positions, tangents, and cumulative distances. Keeping sampling
 * separate from rendering lets the river system add path modes or terrain height
 * sampling without rewriting mesh, material, or gameplay query logic.
 */
import { Vector3 } from "@galacean/engine";
import { RiverPathMode } from "./constants";
import {
  RiverConfig,
  RiverPathControlPoint,
  RiverSamplePoint,
  RiverSampleResult,
  TerrainHeightSampler,
  Vector3Tuple
} from "./types";

interface ResolvedPathPoint {
  source: RiverPathControlPoint;
  position: Vector3;
  width: number;
  depth: number;
  flowSpeed: number;
  bankFeather: number;
}

interface RawPathPoint {
  position: Vector3;
  width: number;
  depth: number;
  flowSpeed: number;
  bankFeather: number;
}

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
  const aWeight = oneMinusT2 * oneMinusT;
  const bWeight = 3 * oneMinusT2 * t;
  const cWeight = 3 * oneMinusT * t2;
  const dWeight = t2 * t;
  return new Vector3(
    a.x * aWeight + b.x * bWeight + c.x * cWeight + d.x * dWeight,
    a.y * aWeight + b.y * bWeight + c.y * cWeight + d.y * dWeight,
    a.z * aWeight + b.z * bWeight + c.z * cWeight + d.z * dWeight
  );
}

function getDistanceXZ(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function normalizeXZ(vector: Vector3): Vector3 {
  const length = Math.sqrt(vector.x * vector.x + vector.z * vector.z);
  if (length < 0.0001) {
    return new Vector3(0, 0, 1);
  }
  return new Vector3(vector.x / length, 0, vector.z / length);
}

function resolveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function resolvePathPoint(point: RiverPathControlPoint, config: RiverConfig): ResolvedPathPoint {
  return {
    source: point,
    position: tupleToVector3(point.position),
    width: resolveNumber(point.width, config.shape.width),
    depth: resolveNumber(point.depth, config.shape.depth),
    flowSpeed: resolveNumber(point.flowSpeed, config.flow.speed),
    bankFeather: resolveNumber(point.bankFeather, config.shape.bankFeather)
  };
}

function createRawPoint(
  position: Vector3,
  current: ResolvedPathPoint,
  next: ResolvedPathPoint,
  t: number
): RawPathPoint {
  return {
    position,
    width: lerp(current.width, next.width, t),
    depth: lerp(current.depth, next.depth, t),
    flowSpeed: lerp(current.flowSpeed, next.flowSpeed, t),
    bankFeather: lerp(current.bankFeather, next.bankFeather, t)
  };
}

function getBezierHandle(anchor: ResolvedPathPoint, fallback: Vector3, offset?: Vector3Tuple): Vector3 {
  if (!offset) {
    return fallback;
  }
  return new Vector3(anchor.position.x + offset[0], anchor.position.y + offset[1], anchor.position.z + offset[2]);
}

function createSamplePoint(
  rawPoint: RawPathPoint,
  tangent: Vector3,
  distance: number,
  heightSampler?: TerrainHeightSampler
): RiverSamplePoint {
  const samplePosition = cloneVector3(rawPoint.position);
  if (heightSampler) {
    samplePosition.y = heightSampler.getHeight(samplePosition.x, samplePosition.z);
  }
  return {
    position: samplePosition,
    tangent: normalizeXZ(tangent),
    distance,
    width: rawPoint.width,
    depth: rawPoint.depth,
    flowSpeed: rawPoint.flowSpeed,
    bankFeather: rawPoint.bankFeather
  };
}

function buildPolylineRawPoints(points: ResolvedPathPoint[], segmentLength: number): RawPathPoint[] {
  const rawPoints: RawPathPoint[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const length = Math.max(getDistanceXZ(current.position, next.position), 0.001);
    const stepCount = Math.max(1, Math.ceil(length / segmentLength));

    for (let step = 0; step < stepCount; step++) {
      if (i > 0 && step === 0) {
        continue;
      }
      const t = step / stepCount;
      rawPoints.push(createRawPoint(lerpVector3(current.position, next.position, t), current, next, t));
    }
  }

  const last = points[points.length - 1];
  rawPoints.push(createRawPoint(cloneVector3(last.position), last, last, 0));
  return rawPoints;
}

function buildCatmullRomRawPoints(points: ResolvedPathPoint[], segmentLength: number): RawPathPoint[] {
  const rawPoints: RawPathPoint[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const segmentLengthEstimate = Math.max(getDistanceXZ(current.position, next.position), 0.001);
    const stepCount = Math.max(3, Math.ceil(segmentLengthEstimate / segmentLength));

    for (let step = 0; step < stepCount; step++) {
      if (i > 0 && step === 0) {
        continue;
      }
      const t = step / stepCount;
      rawPoints.push(createRawPoint(sampleCatmullRom(points, i, t), current, next, t));
    }
  }

  const last = points[points.length - 1];
  rawPoints.push(createRawPoint(cloneVector3(last.position), last, last, 0));
  return rawPoints;
}

function buildBezierRawPoints(points: ResolvedPathPoint[], segmentLength: number): RawPathPoint[] {
  const rawPoints: RawPathPoint[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const length = Math.max(getDistanceXZ(current.position, next.position), 0.001);
    const stepCount = Math.max(3, Math.ceil(length / segmentLength));
    const firstHandleFallback = lerpVector3(current.position, next.position, 1 / 3);
    const secondHandleFallback = lerpVector3(current.position, next.position, 2 / 3);
    const firstHandle = getBezierHandle(current, firstHandleFallback, current.source.out);
    const secondHandle = getBezierHandle(next, secondHandleFallback, next.source.in);

    for (let step = 0; step < stepCount; step++) {
      if (i > 0 && step === 0) {
        continue;
      }
      const t = step / stepCount;
      rawPoints.push(
        createRawPoint(
          sampleCubicBezier(current.position, firstHandle, secondHandle, next.position, t),
          current,
          next,
          t
        )
      );
    }
  }

  const last = points[points.length - 1];
  rawPoints.push(createRawPoint(cloneVector3(last.position), last, last, 0));
  return rawPoints;
}

export function sampleRiverPath(config: RiverConfig, heightSampler?: TerrainHeightSampler): RiverSampleResult {
  const controlPoints = config.path.points.map((point) => resolvePathPoint(point, config));
  const rawPoints =
    config.path.mode === RiverPathMode.Bezier
      ? buildBezierRawPoints(controlPoints, config.path.segmentLength)
      : config.path.mode === RiverPathMode.CatmullRom
        ? buildCatmullRomRawPoints(controlPoints, config.path.segmentLength)
        : buildPolylineRawPoints(controlPoints, config.path.segmentLength);
  const cappedPoints = rawPoints.slice(0, config.quality.maxSegmentCount + 1);
  const samples: RiverSamplePoint[] = [];
  let totalLength = 0;

  for (let i = 0; i < cappedPoints.length; i++) {
    const current = cappedPoints[i];
    const prev = cappedPoints[Math.max(0, i - 1)];
    const next = cappedPoints[Math.min(cappedPoints.length - 1, i + 1)];

    if (i > 0) {
      totalLength += getDistanceXZ(cappedPoints[i - 1].position, current.position);
    }

    samples.push(
      createSamplePoint(
        current,
        new Vector3(next.position.x - prev.position.x, 0, next.position.z - prev.position.z),
        totalLength,
        heightSampler
      )
    );
  }

  return {
    points: samples,
    totalLength
  };
}
