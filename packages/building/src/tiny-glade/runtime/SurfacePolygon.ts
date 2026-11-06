import { EPS, turn } from "./RecoveredRoofGeometry";

// All coordinates are in the original source UV chart. Lines retain their
// authored endpoints; an intersection never becomes a new line definition.
type Exact = [bigint, bigint, bigint];
interface Line {
  a: number[];
  b: number[];
  exact?: Exact;
}
interface Vertex {
  point: number[];
  intersection?: [Line, Line];
  exact?: Exact;
}
interface Edge {
  line: Line;
  sign: 1 | -1;
}
export interface SurfaceBoundary {
  points: number[][];
  constraints?: { vertices: Vertex[]; edges: Edge[] };
}

/** Exterior of a non-overlapping region tessellation. Signed intervals cancel
 * shared edges, including T junctions. Original line/intersection constraints
 * avoid inventing cracks by rounding clipped vertices. A closed wall chart's
 * u=0 and u=period edges are the same edge, not two exposed boundaries. */
export function surfaceRegionBoundary(polygons: readonly SurfaceBoundary[], period = 0): number[][][] {
  const gcd = (a: bigint, b: bigint): bigint => {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) {
      const r = a % b;
      a = b;
      b = r;
    }
    return a;
  };
  type Event = { n: bigint; d: bigint; point: number[]; delta: number };
  const lines = new Map<string, Event[]>();
  const lineKeys = new Map<Line, { key: string; axis: number }>();
  for (const polygon of polygons) {
    const c = constraints(polygon);
    for (let i = 0; i < c.edges.length; i++) {
      const va = c.vertices[i],
        vb = c.vertices[(i + 1) % c.vertices.length];
      const line = c.edges[i].line;
      let canonical = lineKeys.get(line);
      if (!canonical) {
        const l = exactLine(line);
        let divisor = gcd(gcd(l[0], l[1]), l[2]);
        if (!divisor) continue;
        if ((l[0] || l[1]) < 0n) divisor = -divisor;
        canonical = { key: l.map((v) => v / divisor).join("/"), axis: l[1] === 0n ? 1 : 0 };
        lineKeys.set(line, canonical);
      }
      const seam =
        period > 0 &&
        canonical.axis === 1 &&
        ((va.point[0] === 0 && vb.point[0] === 0) || (va.point[0] === period && vb.point[0] === period));
      const key = seam ? "1/0/0" : canonical.key;
      let events = lines.get(key);
      if (!events) lines.set(key, (events = []));
      const axis = canonical.axis;
      const a = exactVertex(va),
        b = exactVertex(vb);
      const order = a[axis] * b[2] - b[axis] * a[2];
      if (!order) continue;
      for (const [v, h, delta] of [
        [va, a, 1],
        [vb, b, -1]
      ] as const) {
        // Keep homogeneous fractions unreduced. Sorting/coalescing uses exact
        // cross-products; repeated per-vertex GCD/string keys add no information.
        events.push({ n: h[axis], d: h[2], point: seam ? [0, v.point[1]] : v.point.slice(), delta });
      }
    }
  }
  const result: number[][][] = [];
  for (const events of lines.values()) {
    const sorted = events.sort((a, b) => {
      const d = a.n * b.d - b.n * a.d;
      return d < 0n ? -1 : d > 0n ? 1 : 0;
    });
    let winding = 0,
      start: number[] | undefined;
    for (let i = 0; i < sorted.length; i++) {
      const event = sorted[i];
      let delta = event.delta;
      while (i + 1 < sorted.length && event.n * sorted[i + 1].d === sorted[i + 1].n * event.d)
        delta += sorted[++i].delta;
      const next = winding + delta;
      if (winding === 0 && next !== 0) start = event.point;
      if (winding !== 0 && next === 0 && start) result.push([start, event.point]);
      winding = next;
    }
  }
  return result;
}
const empty = (): SurfaceBoundary => ({ points: [] });
const machineEpsilon = Number.EPSILON;
// Derived arithmetic caches are not part of the transferable boundary snapshot.
const lineCache = new WeakMap<Line, Exact>();
const vertexCache = new WeakMap<Vertex, Exact>();
const sourceCache = new WeakMap<SurfaceBoundary, NonNullable<SurfaceBoundary["constraints"]>>();
function constraints(source: SurfaceBoundary) {
  if (source.constraints) return source.constraints;
  let result = sourceCache.get(source);
  if (!result) {
    const points = source.points;
    result = {
      vertices: points.map((point) => ({ point })),
      edges: points.map((a, i) => ({ line: { a, b: points[(i + 1) % points.length] }, sign: 1 as const }))
    };
    sourceCache.set(source, result);
  }
  return result;
}
const bits = new DataView(new ArrayBuffer(8));
function dyadic(value: number): [bigint, number] {
  if (value === 0) return [0n, 0];
  bits.setFloat64(0, value);
  const hi = bits.getUint32(0),
    lo = bits.getUint32(4),
    exponent = (hi >>> 20) & 2047;
  const mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  return [(hi >>> 31 ? -1n : 1n) * (exponent ? (1n << 52n) | mantissa : mantissa), exponent ? exponent - 1075 : -1074];
}
function exactPoint(p: number[]): Exact {
  const [x, ex] = dyadic(p[0]),
    [y, ey] = dyadic(p[1]),
    e = Math.min(ex, ey, 0);
  return [x << BigInt(ex - e), y << BigInt(ey - e), 1n << BigInt(-e)];
}
function crossExact(a: Exact, b: Exact): Exact {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function exactLine(line: Line): Exact {
  let exact = lineCache.get(line);
  if (!exact) {
    exact = line.exact ?? crossExact(exactPoint(line.a), exactPoint(line.b));
    lineCache.set(line, exact);
  }
  return exact;
}
function exactVertex(v: Vertex): Exact {
  let exact = vertexCache.get(v);
  if (!exact) {
    const h = v.intersection
      ? crossExact(exactLine(v.intersection[0]), exactLine(v.intersection[1]))
      : (v.exact ?? exactPoint(v.point));
    if (h[2] === 0n) throw Error("Parallel source constraints cannot define a surface vertex");
    exact = h[2] < 0n ? (h.map((n) => -n) as Exact) : h;
    vertexCache.set(v, exact);
  }
  return exact;
}
function quotient(n: bigint, d: bigint): number {
  const numerator = Number(n),
    denominator = Number(d);
  if (Number.isFinite(numerator) && Number.isFinite(denominator)) return numerator / denominator;
  // Keep conversion finite for extreme finite UV values. Each conversion drops
  // at most one floating-point mantissa's rounding error, not a geometric grid.
  const magnitude = n < 0n ? -n : n;
  const ns = Math.max(0, magnitude.toString(2).length - 54),
    ds = Math.max(0, d.toString(2).length - 54);
  return (((n < 0n ? -1 : 1) * Number(magnitude >> BigInt(ns))) / Number(d >> BigInt(ds))) * 2 ** (ns - ds);
}
function side(line: Line, v: Vertex): number {
  if (v.intersection?.includes(line)) return 0;
  const [a, b] = [line.a, line.b],
    p = v.point,
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    px = p[0] - a[0],
    py = p[1] - a[1],
    left = dx * py,
    right = dy * px,
    determinant = left - right;
  // Standard orientation roundoff plus the coordinate conversion error of an
  // exact intersection. Ambiguous results use its constraints, not rounded XY.
  const constructionError = v.intersection
    ? 8 * machineEpsilon * (Math.abs(dx) * Math.abs(p[1]) + Math.abs(dy) * Math.abs(p[0])) + Number.MIN_VALUE
    : 0;
  const error = 8 * machineEpsilon * (Math.abs(left) + Math.abs(right)) + constructionError;
  if (!line.exact && !v.exact && Number.isFinite(determinant) && Math.abs(determinant) > error)
    return Math.sign(determinant);
  const l = exactLine(line),
    h = exactVertex(v),
    exact = l[0] * h[0] + l[1] * h[1] + l[2] * h[2];
  return exact > 0n ? 1 : exact < 0n ? -1 : 0;
}
function intersection(a: Line, b: Line): Vertex {
  const vertex: Vertex = { point: [], intersection: [a, b] },
    h = exactVertex(vertex);
  vertex.point = [quotient(h[0], h[2]), quotient(h[1], h[2])];
  return vertex;
}
function crossing(a: Vertex, b: Vertex, edge: Edge, cut: Edge, sa: number, sb: number): Vertex {
  if (!sa) return a;
  if (!sb) return b;
  return intersection(edge.line, cut.line);
}
function sameVertex(a: Vertex, b: Vertex): boolean {
  if (a === b) return true;
  if (!a.intersection && !b.intersection && !a.exact && !b.exact) return a.point.every((x, i) => x === b.point[i]);
  if (
    a.point.some(
      (x, i) =>
        Math.abs(x - b.point[i]) > 16 * machineEpsilon * Math.max(Math.abs(x), Math.abs(b.point[i])) + Number.MIN_VALUE
    )
  )
    return false;
  const x = exactVertex(a),
    y = exactVertex(b);
  return x[0] * y[2] === y[0] * x[2] && x[1] * y[2] === y[1] * x[2];
}
function boundary(vertices: Vertex[], incoming: Edge[]): SurfaceBoundary {
  // Delete only proven identical intersections. Never classify a short edge as
  // empty by length; its source line may bound a legitimate thin region.
  const v: Vertex[] = [],
    edges: Edge[] = [];
  for (let i = 0; i < vertices.length; i++) {
    if (v.length && sameVertex(v[v.length - 1], vertices[i])) continue;
    v.push(vertices[i]);
    edges.push(incoming[i]);
  }
  if (v.length > 1 && sameVertex(v[0], v[v.length - 1])) {
    edges[0] = edges.pop()!;
    v.pop();
  }
  if (v.length < 3) return empty();
  const outgoing = edges.map((_, i) => edges[(i + 1) % edges.length]);
  if (!v.some((p) => side(outgoing[0].line, p) !== 0)) return empty();
  return { points: v.map((p) => p.point), constraints: { vertices: v, edges: outgoing } };
}
export function surfaceArea(boundary: SurfaceBoundary): number {
  const points = boundary.points;
  let twiceArea = 0;
  for (let i = 1; i + 1 < points.length; i++) twiceArea += turn(points[0], points[i], points[i + 1]);
  return twiceArea / 2;
}
export function surfaceBoundary(input: number[][]): SurfaceBoundary {
  const points: number[][] = [];
  for (const p of input) if (!points.length || p.some((v, i) => v !== points.at(-1)![i])) points.push([...p]);
  if (points.length > 1 && points[0].every((v, i) => v === points.at(-1)![i])) points.pop();
  if (points.length < 3) return empty();
  let area = 0;
  for (let i = 1; i + 1 < points.length; i++) area += turn(points[0], points[i], points[i + 1]);
  if (!area) return empty();
  if (area < 0) points.reverse();
  // Uncut facets need only their authored boundary; expand constraints on first use.
  return { points };
}
/** An affine chart is explicit: rounding transformed endpoints and inferring
 * new constraints can turn intersecting source lines into parallel ones. */
export interface SurfaceAffineMap {
  origin: number[];
  offset: number[];
  u: number[];
  v: number[];
}
function reduced(h: Exact): Exact {
  const gcd = (a: bigint, b: bigint): bigint => {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) [a, b] = [b, a % b];
    return a;
  };
  const d = gcd(gcd(h[0], h[1]), h[2]);
  return d > 1n ? (h.map((x) => x / d) as Exact) : h;
}
function affineMatrix(map: SurfaceAffineMap): Exact[] {
  const values = [...map.u, ...map.v, ...map.offset, ...map.origin].map(dyadic);
  const exponent = Math.min(0, ...values.map((v) => v[1]));
  const [a, d, b, e, x, y, ox, oy] = values.map(([n, p]) => n << BigInt(p - exponent));
  const k = 1n << BigInt(-exponent);
  // Columns of the homogeneous matrix. Translation is constructed exactly too,
  // so an offset cannot erase small but valid source coordinate differences.
  return [
    [a * k, d * k, 0n],
    [b * k, e * k, 0n],
    [x * k - a * ox - b * oy, y * k - d * ox - e * oy, k * k]
  ];
}
function multiply(columns: Exact[], h: Exact): Exact {
  return reduced([0, 1, 2].map((i) => columns[0][i] * h[0] + columns[1][i] * h[1] + columns[2][i] * h[2]) as Exact);
}
function coordinates(h: Exact): number[] {
  return [quotient(h[0], h[2]), quotient(h[1], h[2])];
}
/** Transform both incidence and its exact geometry. The extra homogeneous
 * values belong to this transient boundary and survive structuredClone; they
 * are never written into authoring documents or GPU buffers. */
export function mapSurfaceBoundary(source: SurfaceBoundary, map: SurfaceAffineMap): SurfaceBoundary {
  return transformSurfaceBoundary(source, affineMatrix(map), false);
}

/** Map original triangle correspondences exactly. Each chart may be piecewise
 * affine, but adjacent triangles agree on their common edge and every cut
 * intersection on it. No world-space round trip or rounded affine coefficients.
 * Build once per source triangle, then reuse for all retained fragments. */
export function surfaceTriangleMapper(from: number[][], to: number[][]): (source: SurfaceBoundary) => SurfaceBoundary {
  if (from.length !== 3 || to.length !== 3) throw Error("Surface charts require three corresponding vertices");
  const values = [...from.flat(), ...to.flat()].map(dyadic);
  const exponent = Math.min(0, ...values.map((v) => v[1]));
  const k = 1n << BigInt(-exponent);
  const n = values.map(([v, e]) => v << BigInt(e - exponent));
  // Equal homogeneous scales are essential: independently reducing matrix
  // columns would change the affine map, even though individual points agree.
  const a: Exact[] = [0, 2, 4].map((i) => [n[i], n[i + 1], k]);
  const b: Exact[] = [6, 8, 10].map((i) => [n[i], n[i + 1], k]);
  const rows = [crossExact(a[1], a[2]), crossExact(a[2], a[0]), crossExact(a[0], a[1])];
  let matrix: Exact[] = [0, 1, 2].map(
    (column) =>
      [0, 1, 2].map(
        (row) => b[0][row] * rows[0][column] + b[1][row] * rows[1][column] + b[2][row] * rows[2][column]
      ) as Exact
  );
  if (!matrix[2][2]) throw Error("Source surface chart must be invertible");
  if (matrix[2][2] < 0n) matrix = matrix.map((column) => column.map((v) => -v) as Exact);
  // A collapsed physical face contributes no support area. Test exactly, so
  // representable narrow faces remain valid rather than disappearing by epsilon.
  const determinant = matrix[0][0] * matrix[1][1] - matrix[1][0] * matrix[0][1];
  if (!determinant) return () => empty();
  return (source) => {
    // Untouched corners already have exact published counterparts. Avoid
    // reconstructing them (and allocating rational constraints) through a map.
    // Clipped constraints must never take this path, even if rounded display
    // coordinates happen to coincide with an original corner.
    if (!source.constraints && source.points.length === 3) {
      const indices = source.points.map((p) => from.findIndex((q) => p[0] === q[0] && p[1] === q[1]));
      if (indices.every((i) => i >= 0)) {
        const points = indices.map((i) => to[i].slice());
        if (determinant < 0n) points.reverse();
        return { points };
      }
    }
    return transformSurfaceBoundary(source, matrix, true);
  };
}

function transformSurfaceBoundary(source: SurfaceBoundary, matrix: Exact[], preserveExact: boolean): SurfaceBoundary {
  const determinant = matrix[0][0] * matrix[1][1] - matrix[1][0] * matrix[0][1];
  if (!determinant) throw Error("Surface chart must be invertible");
  const orientation = determinant < 0n ? -1 : 1;
  const transform = (p: number[]) => coordinates(multiply(matrix, exactPoint(p)));
  if (!preserveExact && !source.constraints) return surfaceBoundary(source.points.map(transform));
  const original = constraints(source);
  // adjugate-transpose transforms oriented line equations without reconstructing
  // them from rounded display endpoints. Reflection is handled by edge signs.
  const dual = [crossExact(matrix[1], matrix[2]), crossExact(matrix[2], matrix[0]), crossExact(matrix[0], matrix[1])];
  const lines = new Map<Line, Line>();
  const line = (l: Line) => {
    let result = lines.get(l);
    if (!result) {
      result = { a: transform(l.a), b: transform(l.b), exact: multiply(dual, exactLine(l)) };
      lines.set(l, result);
    }
    return result;
  };
  const vertices: Vertex[] = original.vertices.map((v) => {
    if (v.intersection) return intersection(line(v.intersection[0]), line(v.intersection[1]));
    const exact = multiply(matrix, exactVertex(v));
    return { point: coordinates(exact), exact };
  });
  let edges: Edge[] = original.edges.map((e) => ({
    line: line(e.line),
    sign: (e.sign * orientation) as 1 | -1
  }));
  if (orientation < 0) {
    vertices.reverse();
    edges = edges.map((_, i) => edges[(edges.length - 2 - i + edges.length) % edges.length]);
  }
  return { points: vertices.map((v) => v.point), constraints: { vertices, edges } };
}
function clipHalfplane(polygon: SurfaceBoundary, cut: Edge): SurfaceBoundary {
  if (!polygon.points.length) return polygon;
  const source = constraints(polygon);
  const signs = source.vertices.map((v) => side(cut.line, v) * cut.sign);
  if (signs.every((s) => s >= 0)) return polygon;
  if (signs.every((s) => s <= 0)) return empty();
  const vertices: Vertex[] = [],
    incoming: Edge[] = [];
  const append = (v: Vertex, e: Edge) => {
    vertices.push(v);
    incoming.push(e);
  };
  for (let i = 0; i < source.vertices.length; i++) {
    const j = (i + 1) % source.vertices.length,
      a = source.vertices[i],
      b = source.vertices[j],
      edge = source.edges[i],
      sa = signs[i],
      sb = signs[j];
    if (sa >= 0 && sb >= 0) append(b, edge);
    else if (sa >= 0) append(crossing(a, b, edge, cut, sa, sb), edge);
    else if (sb >= 0) {
      append(crossing(a, b, edge, cut, sa, sb), cut);
      append(b, edge);
    }
  }
  return boundary(vertices, incoming);
}
export function subtractSurfacePolygon(polygon: SurfaceBoundary, clip: SurfaceBoundary): SurfaceBoundary[] {
  if (!polygon.points.length) return [];
  if (!clip.points.length) return [polygon];
  const overlap = intersectSurfacePolygon(polygon, clip);
  if (!overlap.points.length) return [polygon];
  const out: SurfaceBoundary[] = [];
  let remaining = polygon;
  for (const edge of constraints(clip).edges) {
    if (!remaining.points.length) break;
    const outside = clipHalfplane(remaining, { line: edge.line, sign: edge.sign === 1 ? -1 : 1 });
    if (outside.points.length) out.push(outside);
    remaining = clipHalfplane(remaining, edge);
  }
  return out;
}
export function intersectSurfacePolygon(p: SurfaceBoundary, clip: SurfaceBoundary): SurfaceBoundary {
  // An empty polygon is the empty set, not an unconstrained half-plane list.
  if (!p.points.length || !clip.points.length) return empty();
  for (const edge of constraints(clip).edges) p = clipHalfplane(p, edge);
  return p;
}
/** Apply area acceptance once to a complete original facet, not intermediates. */
export function effectiveSurfaceRegions(polygons: SurfaceBoundary[]): SurfaceBoundary[] {
  return polygons.reduce((sum, p) => sum + Math.abs(surfaceArea(p)), 0) > EPS ? polygons : [];
}
export function surfaceMaskTriangles(input: number[][]): SurfaceBoundary[] {
  const original = surfaceBoundary(input);
  if (!effectiveSurfaceRegions([original]).length) return [];
  const polygon = original.points,
    order = polygon.map((_, i) => i),
    out: SurfaceBoundary[] = [];
  const orientation = (a: number[], b: number[], c: number[]) => side({ a, b }, { point: c });
  while (order.length > 3) {
    let clipped = false;
    for (let i = 0; i < order.length; i++) {
      const ai = order[(i + order.length - 1) % order.length],
        bi = order[i],
        ci = order[(i + 1) % order.length],
        a = polygon[ai],
        b = polygon[bi],
        c = polygon[ci];
      if (orientation(a, b, c) <= 0) continue;
      if (
        order.some(
          (k) =>
            k !== ai &&
            k !== bi &&
            k !== ci &&
            orientation(a, b, polygon[k]) >= 0 &&
            orientation(b, c, polygon[k]) >= 0 &&
            orientation(c, a, polygon[k]) >= 0
        )
      )
        continue;
      out.push(surfaceBoundary([a, b, c]));
      order.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw Error("Local edit polygon must be simple and nondegenerate");
  }
  if (order.length === 3) {
    const last = surfaceBoundary(order.map((i) => polygon[i]));
    if (last.points.length) out.push(last);
  }
  return out;
}
/** Optional edit-time diagnostics. Peaks describe a single facet's partition
 * worklist, not the complete scene mesh or GPU memory. */
export interface SurfaceClippingStats {
  facets: number;
  operations: number;
  peakPolygons: number;
  peakVertices: number;
}
export function trackSurfaceClipping(stats: SurfaceClippingStats | undefined, polygons: SurfaceBoundary[]) {
  if (!stats) return;
  stats.operations++;
  stats.peakPolygons = Math.max(stats.peakPolygons, polygons.length);
  stats.peakVertices = Math.max(
    stats.peakVertices,
    polygons.reduce((sum, p) => sum + p.points.length, 0)
  );
}
