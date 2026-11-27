/**
 * Runtime water queries for the river prototype.
 *
 * Rendering a river mesh is not enough for an engine-level water system; gameplay
 * code also needs to ask whether a world position is in water, how deep it is, what
 * direction the flow moves, and how far the point is from the bank. This file keeps
 * that render-independent query logic beside the sampled river path so actors,
 * particles, audio, physics, or AI systems can consume river data without reading
 * mesh vertices or material state directly.
 */
import type { RiverGeometryData } from "../../compiler/river/types";
import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";
import { polygonWaterBoundsOverlap } from "../spatial/WaterBoundsQuery";
import { riverGeometryTriangleDomain, sampleRiverTriangle } from "./RiverTriangleQuery";
import { RIVER_QUERY_EPSILON } from "./constants";

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function maximumGeometryHeightInBounds(
  geometry: RiverGeometryData,
  bounds: WaterBoundsXZ,
  displacement: number,
  start = geometry.drawStart,
  end = geometry.drawStart + geometry.drawCount
): number {
  let maximum = -Infinity;
  for (let i = start; i + 2 < end; i += 3) {
    const domain = riverGeometryTriangleDomain(geometry, i);
    if (!domain) continue;
    const triangle = domain.source;
    if (
      polygonWaterBoundsOverlap(
        domain.triangle.map((p) => [p[0], p[2]] as const),
        bounds
      )
    ) {
      const height = Math.max(...triangle.map((p) => p[1]));
      const sumHeight = triangle.reduce((sum, p) => sum + p[1], 0);
      // Weights sum to one but may be as low as -epsilon: bound the static
      // extrapolation and the absolute weight sum (at most 1 + 4 * epsilon).
      const upper =
        height + RIVER_QUERY_EPSILON * (3 * height - sumHeight) + displacement * (1 + 4 * RIVER_QUERY_EPSILON);
      const scale = Math.max(1, displacement, ...triangle.map((p) => Math.abs(p[1])));
      maximum = Math.max(maximum, upper + RIVER_QUERY_EPSILON * scale);
    }
  }
  return maximum;
}

export function distancePointToSegmentXZ(
  pointX: number,
  pointZ: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSquared = abx * abx + abz * abz;
  const t =
    lengthSquared > RIVER_QUERY_EPSILON ? clamp01(((pointX - ax) * abx + (pointZ - az) * abz) / lengthSquared) : 0;
  return Math.hypot(pointX - (ax + abx * t), pointZ - (az + abz * t));
}

export function isPointInsidePolygonXZ(boundary: Float32Array, pointX: number, pointZ: number): boolean {
  let inside = false;
  const count = boundary.length / 3;
  for (let current = 0, previous = count - 1; current < count; previous = current++) {
    const currentX = boundary[current * 3];
    const currentZ = boundary[current * 3 + 2];
    const previousX = boundary[previous * 3];
    const previousZ = boundary[previous * 3 + 2];
    const crosses =
      currentZ > pointZ !== previousZ > pointZ &&
      pointX < ((previousX - currentX) * (pointZ - currentZ)) / (previousZ - currentZ) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function distanceToPolygonBankXZ(boundary: Float32Array, pointX: number, pointZ: number): number {
  let distance = Number.POSITIVE_INFINITY;
  const count = boundary.length / 3;
  for (let current = 0, previous = count - 1; current < count; previous = current++) {
    distance = Math.min(
      distance,
      distancePointToSegmentXZ(
        pointX,
        pointZ,
        boundary[previous * 3],
        boundary[previous * 3 + 2],
        boundary[current * 3],
        boundary[current * 3 + 2]
      )
    );
  }
  return distance;
}

export interface RiverTriangleSample {
  firstIndex: number;
  secondIndex: number;
  thirdIndex: number;
  firstWeight: number;
  secondWeight: number;
  thirdWeight: number;
}

export function findGeometryTriangleXZ(
  geometry: RiverGeometryData,
  pointX: number,
  pointZ: number,
  out: RiverTriangleSample,
  start = geometry.drawStart,
  end = geometry.drawStart + geometry.drawCount
): boolean {
  for (let offset = start; offset + 2 < end; offset += 3) {
    const domain = riverGeometryTriangleDomain(geometry, offset);
    if (!domain || pointX < domain.minX || pointX > domain.maxX || pointZ < domain.minZ || pointZ > domain.maxZ)
      continue;
    const firstIndex = geometry.indices.at(offset);
    const secondIndex = geometry.indices.at(offset + 1);
    const thirdIndex = geometry.indices.at(offset + 2);
    if (firstIndex === undefined || secondIndex === undefined || thirdIndex === undefined) continue;
    const first = geometry.positions[firstIndex];
    const second = geometry.positions[secondIndex];
    const third = geometry.positions[thirdIndex];
    if (!sampleRiverTriangle(first, second, third, pointX, pointZ, out, domain.triangle)) continue;
    out.firstIndex = firstIndex;
    out.secondIndex = secondIndex;
    out.thirdIndex = thirdIndex;
    return true;
  }
  return false;
}

interface SpanTriangleDomains {
  domains: readonly ReturnType<typeof riverGeometryTriangleDomain>[];
  bounds: Float64Array;
}
const SPAN_TRIANGLE_GROUP_SIZE = 8;
const spanTriangleIndices = new WeakMap<
  RiverGeometryData,
  { rowWidth: number; spans: Map<number, SpanTriangleDomains> }
>();
/** Group consecutive canonical domains without changing draw-order ownership.
 * Bounds belong to the same immutable geometry snapshot as the existing domains. */
function findSpanTriangle(
  geometry: RiverGeometryData,
  rowWidth: number,
  spanIndex: number,
  start: number,
  end: number,
  x: number,
  z: number,
  out: RiverTriangleSample
): boolean {
  let cache = spanTriangleIndices.get(geometry);
  if (!cache || cache.rowWidth !== rowWidth) {
    cache = { rowWidth, spans: new Map() };
    spanTriangleIndices.set(geometry, cache);
  }
  let span = cache.spans.get(spanIndex);
  if (!span) {
    const created: ReturnType<typeof riverGeometryTriangleDomain>[] = [];
    for (let offset = start; offset + 2 < end; offset += 3) created.push(riverGeometryTriangleDomain(geometry, offset));
    const bounds = new Float64Array(Math.ceil(created.length / SPAN_TRIANGLE_GROUP_SIZE) * 4);
    for (let group = 0; group < bounds.length / 4; group++) {
      let minX = Infinity,
        minZ = Infinity,
        maxX = -Infinity,
        maxZ = -Infinity;
      const limit = Math.min((group + 1) * SPAN_TRIANGLE_GROUP_SIZE, created.length);
      for (let i = group * SPAN_TRIANGLE_GROUP_SIZE; i < limit; i++) {
        const domain = created[i];
        if (!domain) continue;
        minX = Math.min(minX, domain.minX);
        minZ = Math.min(minZ, domain.minZ);
        maxX = Math.max(maxX, domain.maxX);
        maxZ = Math.max(maxZ, domain.maxZ);
      }
      bounds.set([minX, minZ, maxX, maxZ], group * 4);
    }
    cache.spans.set(spanIndex, (span = { domains: created, bounds }));
  }
  const { domains, bounds } = span;
  for (let group = 0; group < bounds.length / 4; group++) {
    const b = group * 4;
    if (x < bounds[b] || z < bounds[b + 1] || x > bounds[b + 2] || z > bounds[b + 3]) continue;
    const limit = Math.min((group + 1) * SPAN_TRIANGLE_GROUP_SIZE, domains.length);
    for (let i = group * SPAN_TRIANGLE_GROUP_SIZE; i < limit; i++) {
      const domain = domains[i];
      if (!domain || x < domain.minX || x > domain.maxX || z < domain.minZ || z > domain.maxZ) continue;
      const triangle = domain.source;
      if (!sampleRiverTriangle(triangle[0], triangle[1], triangle[2], x, z, out, domain.triangle)) continue;
      const offset = start + i * 3;
      out.firstIndex = geometry.indices.at(offset)!;
      out.secondIndex = geometry.indices.at(offset + 1)!;
      out.thirdIndex = geometry.indices.at(offset + 2)!;
      return true;
    }
  }
  return false;
}

export function findReachSpanGeometryTriangleXZ(
  geometry: RiverGeometryData,
  sampleCount: number,
  spanIndex: number,
  pointX: number,
  pointZ: number,
  out: RiverTriangleSample
): boolean {
  if (sampleCount < 2 || geometry.positions.length % sampleCount !== 0) return false;
  const rowWidth = geometry.positions.length / sampleCount;
  const spanIndexCount = Math.max(0, rowWidth - 1) * 6;
  const start = geometry.drawStart + spanIndex * spanIndexCount;
  const end = Math.min(start + spanIndexCount, geometry.drawStart + geometry.drawCount);
  return spanIndexCount > 0 && findSpanTriangle(geometry, rowWidth, spanIndex, start, end, pointX, pointZ, out);
}
