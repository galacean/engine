import type { ReadonlyVector3Tuple, RiverGeometryAnalysis, RiverGeometryData } from "./types";
import { RIVER_GEOMETRY_EPSILON } from "./constants";
import type { RiverRibbonJoinFrame } from "./RiverRibbonJoinResolver";

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

export function findRiverBankIntersections(points: readonly ReadonlyVector3Tuple[]): [number, number][] {
  const intersections: [number, number][] = [];
  if (points.length < 4) return intersections;
  // Sweep the axis with the larger extent. Reject disjoint AABBs before the exact
  // predicate; a straight bank has only neighboring candidates, even at High density.
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[2]);
    maxZ = Math.max(maxZ, p[2]);
  }
  const axis = maxX - minX >= maxZ - minZ ? 0 : 2;
  const other = axis === 0 ? 2 : 0;
  const spans = points
    .slice(0, -1)
    .map((a, index) => {
      const b = points[index + 1];
      return {
        index,
        a: { x: a[0], z: a[2] },
        b: { x: b[0], z: b[2] },
        min: Math.min(a[axis], b[axis]),
        max: Math.max(a[axis], b[axis]),
        otherMin: Math.min(a[other], b[other]),
        otherMax: Math.max(a[other], b[other])
      };
    })
    .sort((a, b) => a.min - b.min || a.index - b.index);
  for (let i = 0; i < spans.length; i++) {
    const a = spans[i];
    for (let j = i + 1; j < spans.length && spans[j].min <= a.max; j++) {
      const b = spans[j];
      if (Math.abs(a.index - b.index) <= 1 || a.otherMax < b.otherMin || b.otherMax < a.otherMin) continue;
      if (strictSegmentsIntersect(a.a, a.b, b.a, b.b))
        intersections.push([Math.min(a.index, b.index), Math.max(a.index, b.index)]);
    }
  }
  intersections.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return intersections;
}

export function countDegenerateTriangles(geometry: RiverGeometryData): number {
  const indices = geometry.indices.borrowTypedArray();
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

export interface RiverGeometryInspection {
  readonly summary: RiverGeometryAnalysis;
  readonly banks: readonly {
    readonly side: "左岸" | "右岸";
    readonly points: readonly ReadonlyVector3Tuple[];
    readonly intersections: readonly [number, number][];
  }[];
  readonly fallbackRows: readonly number[];
  readonly foldedRows: readonly number[];
}

/** One inspection supplies production counts and editor locations from the same mesh. */
export function inspectRiverGeometry(
  geometry: RiverGeometryData,
  verticesPerRow: number,
  joins: readonly RiverRibbonJoinFrame[]
): RiverGeometryInspection {
  const banks = (["左岸", "右岸"] as const).map((side, sideIndex) => {
    const points = joins.map((_, row) => geometry.positions[row * verticesPerRow + sideIndex * (verticesPerRow - 1)]);
    return { side, points, intersections: findRiverBankIntersections(points) };
  });
  const fallbackRows = joins.flatMap((join, index) => (join.usedFallback ? [index] : []));
  const foldedRows = new Set<number>();
  const indices = geometry.indices.borrowTypedArray();
  let degenerateTriangleCount = 0;
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = geometry.positions[indices[index]],
      b = geometry.positions[indices[index + 1]],
      c = geometry.positions[indices[index + 2]];
    const area = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
    if (Math.abs(area) <= RIVER_GEOMETRY_EPSILON) degenerateTriangleCount++;
    if (area >= -RIVER_GEOMETRY_EPSILON) foldedRows.add(Math.floor(indices[index] / verticesPerRow));
  }
  return {
    summary: Object.freeze({
      sharpBendFallbackCount: fallbackRows.length,
      bankSelfIntersectionCount: banks.reduce((sum, bank) => sum + bank.intersections.length, 0),
      degenerateTriangleCount
    }),
    banks,
    fallbackRows,
    foldedRows: [...foldedRows]
  };
}
