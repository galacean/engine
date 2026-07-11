import type { ReadonlyVector3Tuple, RiverGeometryAnalysis, RiverGeometryData, RiverSamplePoint } from "./types";
import { RIVER_GEOMETRY_EPSILON } from "./constants";
import { resolveRiverRibbonJoinFrame } from "./RiverRibbonJoinResolver";

interface Point2 {
  readonly x: number;
  readonly z: number;
}

function direction(a: Point2, b: Point2, c: Point2): number {
  return (c.x - a.x) * (b.z - a.z) - (b.x - a.x) * (c.z - a.z);
}

function strictSegmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abC = direction(a, b, c);
  const abD = direction(a, b, d);
  const cdA = direction(c, d, a);
  const cdB = direction(c, d, b);
  return abC * abD < -RIVER_GEOMETRY_EPSILON && cdA * cdB < -RIVER_GEOMETRY_EPSILON;
}

function countPolylineSelfIntersections(points: readonly ReadonlyVector3Tuple[]): number {
  let count = 0;
  for (let first = 0; first + 1 < points.length; first++) {
    const a = { x: points[first][0], z: points[first][2] };
    const b = { x: points[first + 1][0], z: points[first + 1][2] };
    for (let second = first + 2; second + 1 < points.length; second++) {
      const c = { x: points[second][0], z: points[second][2] };
      const d = { x: points[second + 1][0], z: points[second + 1][2] };
      if (strictSegmentsIntersect(a, b, c, d)) count++;
    }
  }
  return count;
}

function countDegenerateTriangles(geometry: RiverGeometryData): number {
  const indices = Array.from(geometry.indices);
  let count = 0;
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = geometry.positions[indices[index]];
    const b = geometry.positions[indices[index + 1]];
    const c = geometry.positions[indices[index + 2]];
    const area = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]));
    if (area <= RIVER_GEOMETRY_EPSILON) count++;
  }
  return count;
}

export function analyzeRiverGeometry(
  samples: readonly RiverSamplePoint[],
  geometry: RiverGeometryData,
  verticesPerRow: number
): RiverGeometryAnalysis {
  const leftBank: ReadonlyVector3Tuple[] = [];
  const rightBank: ReadonlyVector3Tuple[] = [];
  for (let row = 0; row < samples.length; row++) {
    const rowStart = row * verticesPerRow;
    leftBank.push(geometry.positions[rowStart]);
    rightBank.push(geometry.positions[rowStart + verticesPerRow - 1]);
  }
  let sharpBendFallbackCount = 0;
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    if (resolveRiverRibbonJoinFrame(samples, sampleIndex).usedFallback) sharpBendFallbackCount++;
  }
  return Object.freeze({
    sharpBendFallbackCount,
    bankSelfIntersectionCount: countPolylineSelfIntersections(leftBank) + countPolylineSelfIntersections(rightBank),
    degenerateTriangleCount: countDegenerateTriangles(geometry)
  });
}
