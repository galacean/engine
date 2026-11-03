import { LakeBoundaryQueryIndex } from "./LakeBoundaryQueryIndex";
import type {
  LakeBoundaryV1,
  LakePointXZ,
  LakeSplinePoint,
  SampledLakeBoundary
} from "../../authoring/lake/LakeBoundary";

const MAX_BOUNDARY_POINT_COUNT = 8192;
/** Metre tolerance used to identify degenerate Lake edges and coincident contour points. */
export const LAKE_BOUNDARY_EPSILON = 1e-8;
const signedDoubleAreaXZ = (a: LakePointXZ, b: LakePointXZ, c: LakePointXZ): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const midpointXZ = (a: LakePointXZ, b: LakePointXZ): LakePointXZ => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function decodeLakePointXZ(value: unknown): LakePointXZ {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite)) {
    throw new TypeError("Lake coordinates must be finite XZ pairs.");
  }
  return Object.freeze([value[0], value[1]] as const);
}

/** Strict, detached source decoding. No silent fallback to a rectangular/raster mesh. */
export function decodeLakeBoundary(value: unknown): LakeBoundaryV1 {
  const source = value as LakeBoundaryV1 | undefined;
  if (
    !source ||
    source.schemaVersion !== 1 ||
    !Number.isFinite(source.waterLevel) ||
    !Number.isFinite(source.maxChordError) ||
    source.maxChordError < 0.0001 ||
    !Number.isFinite(source.maxSegmentLength) ||
    source.maxSegmentLength < 0.001 ||
    (source.queryCoverage !== "boundary" && source.queryCoverage !== "source-grid") ||
    (source.terrainShorelineTolerance !== undefined &&
      (!Number.isFinite(source.terrainShorelineTolerance) ||
        source.terrainShorelineTolerance < 0 ||
        source.terrainShorelineTolerance > source.maxChordError ||
        source.queryCoverage !== "boundary")) ||
    !Array.isArray(source.rings) ||
    source.rings.length === 0 ||
    source.rings.length > MAX_BOUNDARY_POINT_COUNT / 3
  ) {
    throw new TypeError("Invalid Lake boundary version, water level, sampling limits or coverage policy.");
  }
  let controlPointCount = 0;
  const rings = source.rings.map((ring) => {
    if (!Array.isArray(ring) || ring.length < 3 || (controlPointCount += ring.length) > MAX_BOUNDARY_POINT_COUNT) {
      throw new RangeError("Lake rings require at least three points and at most 8192 points in total.");
    }
    return Object.freeze(
      ring.map((p: LakeSplinePoint) => {
        if (!p || typeof p !== "object") throw new TypeError("Invalid Lake spline point.");
        return Object.freeze({
          position: decodeLakePointXZ(p.position),
          ...(p.incoming === undefined ? {} : { incoming: decodeLakePointXZ(p.incoming) }),
          ...(p.outgoing === undefined ? {} : { outgoing: decodeLakePointXZ(p.outgoing) })
        });
      })
    );
  });
  return Object.freeze({
    schemaVersion: 1,
    waterLevel: source.waterLevel,
    rings: Object.freeze(rings),
    maxChordError: source.maxChordError,
    maxSegmentLength: source.maxSegmentLength,
    ...(source.terrainShorelineTolerance === undefined
      ? {}
      : { terrainShorelineTolerance: source.terrainShorelineTolerance }),
    queryCoverage: source.queryCoverage
  });
}

function distanceToSegment(x: number, z: number, a: LakePointXZ, b: LakePointXZ): number {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

const shoreIndices = new WeakMap<SampledLakeBoundary["rings"], LakeBoundaryQueryIndex>();

/** Positive inside, negative outside; even/odd parity is independent of ring winding. */
export function sampleLakeSignedShoreDistance(rings: SampledLakeBoundary["rings"], x: number, z: number): number {
  let index = shoreIndices.get(rings);
  if (
    !index &&
    Object.isFrozen(rings) &&
    rings.every((r) => Object.isFrozen(r) && r.every((p) => Object.isFrozen(p)))
  ) {
    index = new LakeBoundaryQueryIndex(rings);
    shoreIndices.set(rings, index);
  }
  if (index) return index.sample(x, z);
  let inside = false,
    distance = Infinity;
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      distance = Math.min(distance, distanceToSegment(x, z, a, b));
      if (a[1] > z !== b[1] > z && x < a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
    }
  return distance < LAKE_BOUNDARY_EPSILON ? 0 : inside ? distance : -distance;
}

export function sampleLakeBoundary(source: LakeBoundaryV1): SampledLakeBoundary {
  let sampledPointCount = 0;
  const rings = source.rings.map((ring) => {
    const result: LakePointXZ[] = [];
    const emit = (p: LakePointXZ): void => {
      if (++sampledPointCount > MAX_BOUNDARY_POINT_COUNT)
        throw new RangeError("Lake sampling exceeds 8192 points; increase sampling tolerance.");
      result.push(Object.freeze([p[0], p[1]] as const));
    };
    const subdivide = (a: LakePointXZ, b: LakePointXZ, c: LakePointXZ, d: LakePointXZ, depth: number): void => {
      const chordError = Math.max(distanceToSegment(b[0], b[1], a, d), distanceToSegment(c[0], c[1], a, d));
      if (chordError <= source.maxChordError && Math.hypot(d[0] - a[0], d[1] - a[1]) <= source.maxSegmentLength) {
        emit(a);
        return;
      }
      if (depth >= 24) throw new RangeError("Lake curve cannot satisfy sampling tolerance.");
      const ab = midpointXZ(a, b),
        bc = midpointXZ(b, c),
        cd = midpointXZ(c, d);
      const abc = midpointXZ(ab, bc),
        bcd = midpointXZ(bc, cd),
        midpoint = midpointXZ(abc, bcd);
      subdivide(a, ab, abc, midpoint, depth + 1);
      subdivide(midpoint, bcd, cd, d, depth + 1);
    };
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      if (Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]) < LAKE_BOUNDARY_EPSILON) {
        throw new RangeError("Lake ring has duplicate adjacent points or a repeated closing endpoint.");
      }
      subdivide(a.position, a.outgoing ?? a.position, b.incoming ?? b.position, b.position, 0);
    }
    const area = result.reduce(
      (sum, a, i) => sum + signedDoubleAreaXZ(result[0], a, result[(i + 1) % result.length]),
      0
    );
    if (Math.abs(area) < LAKE_BOUNDARY_EPSILON) throw new RangeError("Lake ring is degenerate.");
    return Object.freeze(result);
  });
  // Sweep by X bounds before exact segment tests; adjacent edges may share only their endpoint.
  const edges = rings.flatMap((ring, ringIndex) =>
    ring.map((start, segmentIndex) => ({
      start,
      end: ring[(segmentIndex + 1) % ring.length],
      ringIndex,
      segmentIndex,
      segmentCount: ring.length
    }))
  );
  edges.sort((left, right) => Math.min(left.start[0], left.end[0]) - Math.min(right.start[0], right.end[0]));
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const candidate = edges[j];
      if (Math.min(candidate.start[0], candidate.end[0]) > Math.max(edge.start[0], edge.end[0]) + LAKE_BOUNDARY_EPSILON)
        break;
      if (
        Math.max(edge.start[1], edge.end[1]) < Math.min(candidate.start[1], candidate.end[1]) - LAKE_BOUNDARY_EPSILON ||
        Math.max(candidate.start[1], candidate.end[1]) < Math.min(edge.start[1], edge.end[1]) - LAKE_BOUNDARY_EPSILON
      )
        continue;
      const segmentDistance = Math.abs(edge.segmentIndex - candidate.segmentIndex);
      if (
        edge.ringIndex === candidate.ringIndex &&
        (segmentDistance === 1 || segmentDistance === edge.segmentCount - 1)
      )
        continue;
      if (
        source.queryCoverage === "source-grid" &&
        [edge.start, edge.end].some((point) =>
          [candidate.start, candidate.end].some((other) => point[0] === other[0] && point[1] === other[1])
        )
      )
        continue;
      if (
        signedDoubleAreaXZ(edge.start, edge.end, candidate.start) *
          signedDoubleAreaXZ(edge.start, edge.end, candidate.end) <=
          LAKE_BOUNDARY_EPSILON &&
        signedDoubleAreaXZ(candidate.start, candidate.end, edge.start) *
          signedDoubleAreaXZ(candidate.start, candidate.end, edge.end) <=
          LAKE_BOUNDARY_EPSILON
      ) {
        throw new RangeError("Lake rings self-intersect or touch; separate the contours before compiling.");
      }
    }
  }
  return Object.freeze({
    waterLevel: source.waterLevel,
    ...(source.terrainShorelineTolerance === undefined
      ? {}
      : { terrainShorelineTolerance: source.terrainShorelineTolerance }),
    queryCoverage: source.queryCoverage,
    rings: Object.freeze(rings)
  });
}

/** Deterministic horizontal sweep, including concavities and holes. No triangle crosses a ring. */
export function triangulateLakeBoundary(boundary: SampledLakeBoundary, maximumTriangles: number): Float32Array {
  const edges = boundary.rings.flatMap((ring) => ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length] })));
  const rows = [...new Set(edges.map(({ a }) => a[1]))].sort((a, b) => a - b);
  const output: number[] = [];
  const emit = (a: LakePointXZ, b: LakePointXZ, c: LakePointXZ): void => {
    if (Math.abs(signedDoubleAreaXZ(a, b, c)) <= LAKE_BOUNDARY_EPSILON) return;
    if (output.length / 9 >= maximumTriangles) throw new RangeError("Lake triangulation exceeds triangle budget.");
    for (const p of [a, c, b]) output.push(p[0], boundary.waterLevel, p[1]);
  };
  const intersectEdgeAtZ = (edge: (typeof edges)[number], z: number): number =>
    edge.a[0] + ((z - edge.a[1]) * (edge.b[0] - edge.a[0])) / (edge.b[1] - edge.a[1]);
  const findRowInteriorPoints = (z: number, left: number, right: number): LakePointXZ[] => {
    const cuts = edges
      .filter(
        (edge) => edge.a[1] !== edge.b[1] && z >= Math.min(edge.a[1], edge.b[1]) && z <= Math.max(edge.a[1], edge.b[1])
      )
      .map((edge) => intersectEdgeAtZ(edge, z))
      .filter((x) => x > left + LAKE_BOUNDARY_EPSILON && x < right - LAKE_BOUNDARY_EPSILON);
    return [...new Set(cuts)].sort((x, y) => x - y).map((x) => [x, z] as const);
  };
  for (let row = 0; row + 1 < rows.length; row++) {
    const z0 = rows[row],
      z1 = rows[row + 1],
      midpoint = (z0 + z1) / 2;
    // Symmetric curves can produce rows differing only by floating-decodeLakePointXZ noise.
    if (z1 - z0 <= LAKE_BOUNDARY_EPSILON || midpoint <= z0 || midpoint >= z1) continue;
    const active = edges.filter(({ a, b }) => Math.min(a[1], b[1]) < midpoint && Math.max(a[1], b[1]) > midpoint);
    active.sort((a, b) => intersectEdgeAtZ(a, midpoint) - intersectEdgeAtZ(b, midpoint));
    if (active.length % 2) throw new Error("Lake triangulation encountered an open contour.");
    for (let i = 0; i < active.length; i += 2) {
      const a: LakePointXZ = [intersectEdgeAtZ(active[i], z0), z0],
        b: LakePointXZ = [intersectEdgeAtZ(active[i + 1], z0), z0];
      const c: LakePointXZ = [intersectEdgeAtZ(active[i + 1], z1), z1],
        d: LakePointXZ = [intersectEdgeAtZ(active[i], z1), z1];

      const bottom = findRowInteriorPoints(z0, a[0], b[0]),
        top = findRowInteriorPoints(z1, d[0], c[0]);
      if (!bottom.length && !top.length) {
        emit(a, b, c);
        emit(a, c, d);
      } else {
        const polygon = [a, ...bottom, b, c, ...top.reverse(), d];
        const center: LakePointXZ = [(a[0] + b[0] + c[0] + d[0]) / 4, midpoint];
        for (let j = 0; j < polygon.length; j++) emit(center, polygon[j], polygon[(j + 1) % polygon.length]);
      }
    }
  }
  if (!output.length) throw new RangeError("Lake triangulation produced no surface.");
  return new Float32Array(output);
}
