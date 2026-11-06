import type {
  V2Point,
  V2Point3,
  V2Heightfield,
  V2Mesh,
  V2PlacedBox,
  V2WaterSurface,
  WorldSnapshot
} from "../spatial/V2Model.ts";

/** Clamp a scalar to a closed interval. @returns The bounded value. */
export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}
/** Quintic transition with zero first and second derivatives at its endpoints. @returns Weight in [0, 1]. */
export function smooth5(t: number): number {
  const v = clamp(t, 0, 1);
  return v * v * v * (v * (v * 6 - 15) + 10);
}
/** Stable FNV-derived content hash for reproducible authoring identities. @returns Eight hexadecimal digits. */
export function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
/** Stateless named random draw; adding another object does not shift this stream. @returns Value in [0, 1). */
export function namedRandom(seed: number, name: string): number {
  let h = parseInt(hashText(`${seed}:${name}`), 16);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Horizontal Euclidean distance. @returns Distance in metres. */
export function distance(a: V2Point, b: V2Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
/** Project onto a finite segment. @returns Nearest point, interpolation parameter and distance. */
export function nearestSegment(p: V2Point, a: V2Point, b: V2Point): { point: V2Point; t: number; distance: number } {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    l = dx * dx + dz * dz;
  const t = l > 0 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / l, 0, 1) : 0;
  const point = { x: a.x + dx * t, z: a.z + dz * t };
  return { point, t, distance: distance(p, point) };
}
/** Odd-even containment for a simple polygon. @returns Whether the point is inside or on an edge. */
export function pointInPolygon(p: V2Point, polygon: V2Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    // Only points in an edge's tolerance-expanded bounds can satisfy the original distance test.
    // Keep Math.hypot for the final comparison so threshold rounding remains identical.
    const dx = b.x - a.x,
      dz = b.z - a.z;
    // Use the same rounded endpoint as nearestSegment; a + (b - a) can differ from b at large magnitudes.
    const endX = a.x + dx,
      endZ = a.z + dz;
    if (
      p.x >= Math.min(a.x, endX) - 1e-7 &&
      p.x <= Math.max(a.x, endX) + 1e-7 &&
      p.z >= Math.min(a.z, endZ) - 1e-7 &&
      p.z <= Math.max(a.z, endZ) + 1e-7
    ) {
      const l = dx * dx + dz * dz;
      const t = l > 0 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / l, 0, 1) : 0;
      const ex = p.x - (a.x + dx * t),
        ez = p.z - (a.z + dz * t);
      if (Math.abs(ex) < 1e-7 && Math.abs(ez) < 1e-7 && Math.hypot(ex, ez) < 1e-7) return true;
    }
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
/** Signed distance to a polygon boundary, negative inside. @returns Distance in metres. */
export function polygonDistance(p: V2Point, polygon: V2Point[]): number {
  let d = Infinity;
  for (let i = 0; i < polygon.length; i++)
    d = Math.min(d, nearestSegment(p, polygon[i], polygon[(i + 1) % polygon.length]).distance);
  return pointInPolygon(p, polygon) ? -d : d;
}
/** Detect a proper crossing between two line segments. @returns Whether interiors cross. */
export function segmentsCross(a: V2Point, b: V2Point, c: V2Point, d: V2Point): boolean {
  const cross = (p: V2Point, q: V2Point, r: V2Point) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) < -1e-8 && cross(c, d, a) * cross(c, d, b) < -1e-8;
}
/** Check that a polygon has nonzero area and no crossing or duplicate consecutive edges. @returns Whether it is a supported simple polygon. */
export function isSimplePolygon(points: V2Point[]): boolean {
  if (points.length < 3) return false;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (distance(a, b) < 1e-5) return false;
    area += a.x * b.z - b.x * a.z;
    for (let j = i + 2; j < points.length; j++)
      if ((j + 1) % points.length !== i && segmentsCross(a, b, points[j], points[(j + 1) % points.length]))
        return false;
  }
  return Math.abs(area) > 1e-4;
}
/** Triangulate a concave horizontal polygon, including holes joined by a doubled bridge. @returns Upward-facing triangles or an empty mesh when unsupported. */
export function triangulatePolygon(points: V2Point[], level: number): V2Mesh {
  const positions = points.flatMap((p) => [p.x, level, p.z]),
    indices: number[] = [];
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const b = points[(i + 1) % points.length];
    area += points[i].x * b.z - b.x * points[i].z;
  }
  const order = points.map((_, i) => i);
  if (area < 0) order.reverse();
  const cross = (a: V2Point, b: V2Point, c: V2Point) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  let remaining = points.length * points.length;
  while (order.length > 3 && remaining-- > 0) {
    let found = false;
    for (let i = 0; i < order.length; i++) {
      const a = order[(i + order.length - 1) % order.length],
        b = order[i],
        c = order[(i + 1) % order.length];
      if (cross(points[a], points[b], points[c]) <= 1e-8) continue;
      if (
        order.some(
          (v) =>
            v !== a &&
            v !== b &&
            v !== c &&
            ![a, b, c].some((k) => points[k].x === points[v].x && points[k].z === points[v].z) &&
            cross(points[a], points[b], points[v]) >= -1e-8 &&
            cross(points[b], points[c], points[v]) >= -1e-8 &&
            cross(points[c], points[a], points[v]) >= -1e-8
        )
      )
        continue;
      indices.push(a, c, b);
      order.splice(i, 1);
      found = true;
      break;
    }
    if (!found) return { positions, indices: [] };
  }
  if (order.length === 3) indices.push(order[0], order[2], order[1]);
  return { positions, indices };
}
/** Arc-length resampling preserving the endpoints. @returns A point list with spacing at most the requested interval. */
export function resampleLine(points: V2Point[], spacing: number): V2Point[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const output: V2Point[] = [{ ...points[0] }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      n = Math.max(1, Math.ceil(distance(a, b) / spacing));
    for (let k = 1; k <= n; k++) output.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return output;
}
/** Interpolating Catmull-Rom curve with bounded per-segment subdivision. @returns Smooth samples including all authored controls. */
export function curveLine(points: V2Point[], spacing: number): V2Point[] {
  if (points.length < 3) return resampleLine(points, spacing);
  const out: V2Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)],
      b = points[i],
      c = points[i + 1],
      d = points[Math.min(points.length - 1, i + 2)];
    const n = Math.max(4, Math.ceil(distance(b, c) / spacing));
    for (let j = 0; j < n; j++) {
      const t = j / n,
        t2 = t * t,
        t3 = t2 * t;
      const f = (a0: number, b0: number, c0: number, d0: number) =>
        0.5 * (2 * b0 + (-a0 + c0) * t + (2 * a0 - 5 * b0 + 4 * c0 - d0) * t2 + (-a0 + 3 * b0 - 3 * c0 + d0) * t3);
      out.push({ x: f(a.x, b.x, c.x, d.x), z: f(a.z, b.z, c.z, d.z) });
    }
  }
  out.push({ ...points[points.length - 1] });
  return resampleLine(out, spacing);
}
/** Build a world-space ribbon whose vertices and width checks share the same geometry. @returns Upward triangle mesh and boundary. */
export function ribbon(points: V2Point3[], widths: number[]): { mesh: V2Mesh; outline: V2Point[] } {
  const positions: number[] = [],
    indices: number[] = [],
    left: V2Point[] = [],
    right: V2Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const l = Math.max(1e-6, distance(a, b)),
      nx = -(b.z - a.z) / l,
      nz = (b.x - a.x) / l,
      w = widths[i] / 2;
    const p0 = { x: p.x + nx * w, z: p.z + nz * w },
      p1 = { x: p.x - nx * w, z: p.z - nz * w };
    left.push(p0);
    right.push(p1);
    positions.push(p0.x, p.y, p0.z, p1.x, p.y, p1.z);
    if (i > 0) {
      const a0 = (i - 1) * 2,
        b0 = i * 2;
      indices.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
  }
  return { mesh: { positions, indices }, outline: left.concat(right.reverse()) };
}
/** Sample the exact b-c diagonal triangulation used by the terrain renderer. @returns Elevation in metres, clamped to the grid boundary. */
export function sampleHeight(field: V2Heightfield, x: number, z: number): number {
  const r = field.resolution,
    gx = clamp((x / field.size + 0.5) * (r - 1), 0, r - 1),
    gz = clamp((z / field.size + 0.5) * (r - 1), 0, r - 1);
  const ix = Math.min(r - 2, Math.floor(gx)),
    iz = Math.min(r - 2, Math.floor(gz)),
    tx = gx - ix,
    tz = gz - iz;
  const a = iz * r + ix,
    b = a + 1,
    c = a + r,
    d = c + 1,
    h = field.heights;
  return tx + tz <= 1
    ? h[a] + tx * (h[b] - h[a]) + tz * (h[c] - h[a])
    : h[d] + (1 - tx) * (h[c] - h[d]) + (1 - tz) * (h[b] - h[d]);
}
/** Sample the exact planar gradient magnitude of the terrain triangle. @returns Rise/run. */
export function sampleSlope(field: V2Heightfield, x: number, z: number): number {
  const r = field.resolution,
    s = field.size / (r - 1),
    gx = clamp((x / field.size + 0.5) * (r - 1), 0, r - 1),
    gz = clamp((z / field.size + 0.5) * (r - 1), 0, r - 1);
  const ix = Math.min(r - 2, Math.floor(gx)),
    iz = Math.min(r - 2, Math.floor(gz)),
    a = iz * r + ix,
    h = field.heights;
  return gx - ix + gz - iz <= 1
    ? Math.hypot(h[a + 1] - h[a], h[a + r] - h[a]) / s
    : Math.hypot(h[a + r + 1] - h[a + r], h[a + r + 1] - h[a + 1]) / s;
}
/** Barycentric surface query against published triangles. @returns Height or null outside the footprint. */
export function sampleMesh(mesh: V2Mesh, x: number, z: number): number | null {
  const p = mesh.positions;
  for (let k = 0; k < mesh.indices.length; k += 3) {
    const a = mesh.indices[k] * 3,
      b = mesh.indices[k + 1] * 3,
      c = mesh.indices[k + 2] * 3;
    if (
      x < Math.min(p[a], p[b], p[c]) - 1e-7 ||
      x > Math.max(p[a], p[b], p[c]) + 1e-7 ||
      z < Math.min(p[a + 2], p[b + 2], p[c + 2]) - 1e-7 ||
      z > Math.max(p[a + 2], p[b + 2], p[c + 2]) + 1e-7
    )
      continue;
    const den = (p[b + 2] - p[c + 2]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 2] - p[c + 2]);
    if (Math.abs(den) < 1e-10) continue;
    const u = ((p[b + 2] - p[c + 2]) * (x - p[c]) + (p[c] - p[b]) * (z - p[c + 2])) / den;
    const v = ((p[c + 2] - p[a + 2]) * (x - p[c]) + (p[a] - p[c]) * (z - p[c + 2])) / den;
    if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) return u * p[a + 1] + v * p[b + 1] + (1 - u - v) * p[c + 1];
  }
  return null;
}
/** Query the union of all actual water triangles. @returns Highest surface or null on dry ground. */
export function sampleWater(snapshot: Pick<WorldSnapshot, "waters">, x: number, z: number): number | null {
  let level: number | null = null;
  for (const surface of snapshot.waters) {
    const h = sampleMesh(surface.mesh, x, z);
    if (h !== null) level = level === null ? h : Math.max(h, level);
  }
  return level;
}
/** Conservative horizontal distance to the published water footprint. @returns Zero in water, otherwise distance to its nearest triangle edge. */
export function distanceToWater(waters: V2WaterSurface[], p: V2Point): number {
  let best = Infinity;
  for (const water of waters) {
    if (sampleMesh(water.mesh, p.x, p.z) !== null) return 0;
    for (let i = 0; i < water.outline.length; i++)
      best = Math.min(
        best,
        nearestSegment(p, water.outline[i], water.outline[(i + 1) % water.outline.length]).distance
      );
  }
  return best;
}
/** Horizontal distance to a rotated rectangular footprint. @returns Zero inside the box. */
export function distanceToBox(
  box: Pick<V2PlacedBox, "center" | "yaw" | "sizeX" | "sizeZ">,
  x: number,
  z: number
): number {
  const dx = x - box.center.x,
    dz = z - box.center.z,
    c = Math.cos(box.yaw),
    s = Math.sin(box.yaw);
  return Math.hypot(
    Math.max(0, Math.abs(dx * c + dz * s) - box.sizeX / 2),
    Math.max(0, Math.abs(-dx * s + dz * c) - box.sizeZ / 2)
  );
}
/** Test a vertical walker footprint against the authoritative terrain, water and collidable boxes. @returns Whether the sampled support is traversable. */
export function canWalk(snapshot: WorldSnapshot, x: number, z: number, radius = snapshot.player.radius): boolean {
  const half = snapshot.size / 2;
  if (Math.abs(x) + radius >= half || Math.abs(z) + radius >= half) return false;
  const y = sampleHeight(snapshot.heightfield, x, z);
  if (distanceToWater(snapshot.waters, { x, z }) <= radius) return false;
  for (const box of snapshot.boxes)
    if (
      box.collision &&
      box.baseY + box.sizeY > y + 0.1 &&
      box.baseY < y + snapshot.player.eyeHeight + 0.2 &&
      distanceToBox(box, x, z) <= radius
    )
      return false;
  if (
    measureCorridor({ ...snapshot, waters: [], boxes: [] }, { x, z }, { x, z }, radius).slope >
    snapshot.player.maxSlope + 1e-6
  )
    return false;
  return true;
}
/** Segment-versus-OBB slab intersection used by visibility, including exact rotation. @returns First hit parameter or null. */
export function segmentBoxHit(a: V2Point3, b: V2Point3, box: V2PlacedBox): number | null {
  const c = Math.cos(box.yaw),
    s = Math.sin(box.yaw);
  const local = (p: V2Point3) => [
    (p.x - box.center.x) * c + (p.z - box.center.z) * s,
    p.y - box.y,
    -(p.x - box.center.x) * s + (p.z - box.center.z) * c
  ];
  const p = local(a),
    q = local(b),
    half = [box.sizeX / 2, box.sizeY / 2, box.sizeZ / 2];
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 3; i++) {
    const delta = q[i] - p[i];
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(p[i]) > half[i]) return null;
    } else {
      let t0 = (-half[i] - p[i]) / delta,
        t1 = (half[i] - p[i]) / delta;
      if (t0 > t1) [t0, t1] = [t1, t0];
      lo = Math.max(lo, t0);
      hi = Math.min(hi, t1);
      if (lo > hi) return null;
    }
  }
  return lo;
}

/** Minimum distance between finite horizontal segments, including intersections. @returns Separation in metres. */
export function segmentDistance(a: V2Point, b: V2Point, c: V2Point, d: V2Point): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(
    nearestSegment(a, c, d).distance,
    nearestSegment(b, c, d).distance,
    nearestSegment(c, a, b).distance,
    nearestSegment(d, a, b).distance
  );
}
/** Distance between a segment and a filled simple polygon. @returns Zero on intersection. */
export function segmentPolygonDistance(a: V2Point, b: V2Point, polygon: V2Point[]): number {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return 0;
  let d = Infinity;
  for (let i = 0; i < polygon.length; i++)
    d = Math.min(d, segmentDistance(a, b, polygon[i], polygon[(i + 1) % polygon.length]));
  return d;
}
/** Exact horizontal rectangle corners in the same yaw convention as its OBB. @returns Four boundary points. */
export function boxFootprint(box: Pick<V2PlacedBox, "center" | "yaw" | "sizeX" | "sizeZ">): V2Point[] {
  const c = Math.cos(box.yaw),
    s = Math.sin(box.yaw);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([x, z]) => ({
    x: box.center.x + (c * x * box.sizeX) / 2 - (s * z * box.sizeZ) / 2,
    z: box.center.z + (s * x * box.sizeX) / 2 + (c * z * box.sizeZ) / 2
  }));
}
/** Measure the whole capsule corridor against water, boxes, and every intersected terrain triangle. @param snapshot Authoritative geometry. @param a Segment start. @param b Segment end. @param radius Corridor half-width including actor margin. @param spend Shared work-accounting callback. @returns Minimum obstacle clearance and maximum supporting triangle slope. */
export function measureCorridor(
  snapshot: Pick<WorldSnapshot, "size" | "heightfield" | "waters" | "boxes">,
  a: V2Point,
  b: V2Point,
  radius: number,
  spend: (count: number) => void = () => {}
): { clearance: number; slope: number } {
  let clearance = snapshot.size / 2 - Math.max(Math.abs(a.x), Math.abs(a.z), Math.abs(b.x), Math.abs(b.z)),
    slope = 0;
  for (const water of snapshot.waters) {
    spend(water.outline.length * 4);
    clearance = Math.min(clearance, segmentPolygonDistance(a, b, water.outline));
  }
  for (const box of snapshot.boxes)
    if (box.collision) {
      spend(16);
      clearance = Math.min(clearance, segmentPolygonDistance(a, b, boxFootprint(box)));
    }
  const field = snapshot.heightfield,
    r = field.resolution,
    cell = field.size / (r - 1),
    half = field.size / 2;
  const x0 = clamp(Math.floor((Math.min(a.x, b.x) - radius + half) / cell), 0, r - 2),
    x1 = clamp(Math.floor((Math.max(a.x, b.x) + radius + half) / cell), 0, r - 2);
  const z0 = clamp(Math.floor((Math.min(a.z, b.z) - radius + half) / cell), 0, r - 2),
    z1 = clamp(Math.floor((Math.max(a.z, b.z) + radius + half) / cell), 0, r - 2);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const p = { x: x * cell - half, z: z * cell - half },
        q = { x: p.x + cell, z: p.z },
        u = { x: p.x, z: p.z + cell },
        v = { x: p.x + cell, z: p.z + cell },
        id = z * r + x,
        h = field.heights;
      spend(24);
      if (segmentPolygonDistance(a, b, [p, q, u]) <= radius + 1e-6)
        slope = Math.max(slope, Math.hypot(h[id + 1] - h[id], h[id + r] - h[id]) / cell);
      if (segmentPolygonDistance(a, b, [q, v, u]) <= radius + 1e-6)
        slope = Math.max(slope, Math.hypot(h[id + r + 1] - h[id + r], h[id + r + 1] - h[id + 1]) / cell);
    }
  return { clearance, slope };
}

/** Exact elevation range over a polygon on the piecewise affine terrain. @param field Final terrain triangulation. @param polygon Simple horizontal footprint. @returns Minimum and maximum elevations over triangle vertices and footprint crossings. */
export function terrainRange(
  field: V2Heightfield,
  polygon: V2Point[],
  spend: (count: number) => void = () => {}
): { min: number; max: number } {
  let min = Infinity,
    max = -Infinity;
  const sample = (p: V2Point) => {
    spend(1);
    const h = sampleHeight(field, p.x, p.z);
    min = Math.min(min, h);
    max = Math.max(max, h);
  };
  const cell = field.size / (field.resolution - 1),
    half = field.size / 2;
  const x0 = clamp(Math.ceil((Math.min(...polygon.map((p) => p.x)) + half) / cell), 0, field.resolution - 1),
    x1 = clamp(Math.floor((Math.max(...polygon.map((p) => p.x)) + half) / cell), 0, field.resolution - 1);
  const z0 = clamp(Math.ceil((Math.min(...polygon.map((p) => p.z)) + half) / cell), 0, field.resolution - 1),
    z1 = clamp(Math.floor((Math.max(...polygon.map((p) => p.z)) + half) / cell), 0, field.resolution - 1);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      spend(polygon.length);
      const p = { x: x * cell - half, z: z * cell - half };
      if (pointInPolygon(p, polygon)) sample(p);
    }
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    sample(a);
    for (const [origin, end, offset] of [
      [a.x, b.x, half],
      [a.z, b.z, half],
      [a.x + a.z, b.x + b.z, field.size]
    ]) {
      if (Math.abs(end - origin) < 1e-9) continue;
      const lo = Math.ceil((Math.min(origin, end) + offset) / cell),
        hi = Math.floor((Math.max(origin, end) + offset) / cell);
      for (let k = lo; k <= hi; k++) {
        spend(1);
        const t = (k * cell - offset - origin) / (end - origin);
        if (t > 0 && t < 1) sample({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
  }
  return { min, max };
}
