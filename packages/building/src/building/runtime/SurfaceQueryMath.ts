type Vec3 = [number, number, number];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const squared = (v: Vec3) => dot(v, v);

function pointSegmentSquared(p: Vec3, a: Vec3, b: Vec3): number {
  const edge = sub(b, a),
    length = squared(edge);
  return squared(sub(p, add(a, scale(edge, length === 0 ? 0 : clamp(dot(sub(p, a), edge) / length)))));
}

function segmentsSquared(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const u = sub(b, a),
    v = sub(d, c),
    w = sub(a, c);
  const uu = squared(u),
    vv = squared(v),
    uv = dot(u, v),
    uw = dot(u, w),
    vw = dot(v, w);
  if (uu === 0) return pointSegmentSquared(a, c, d);
  if (vv === 0) return pointSegmentSquared(c, a, b);
  // Endpoints cover parallel segments and a constrained minimum on any edge.
  let best = Math.min(
    pointSegmentSquared(a, c, d),
    pointSegmentSquared(b, c, d),
    pointSegmentSquared(c, a, b),
    pointSegmentSquared(d, a, b)
  );
  const denominator = squared(cross(u, v));
  if (denominator > 0) {
    const s = (uv * vw - vv * uw) / denominator,
      t = (uu * vw - uv * uw) / denominator;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1)
      best = Math.min(best, squared(sub(add(a, scale(u, s)), add(c, scale(v, t)))));
  }
  return best;
}

/** Whether a point projected onto the triangle plane lies within its edges. */
function inside(p: Vec3, a: Vec3, b: Vec3, c: Vec3, normal: Vec3): boolean {
  return (
    dot(cross(sub(b, a), sub(p, a)), normal) >= 0 &&
    dot(cross(sub(c, b), sub(p, b)), normal) >= 0 &&
    dot(cross(sub(a, c), sub(p, c)), normal) >= 0
  );
}

/** Squared Euclidean distance to a closed triangle (including degenerate edges).
 * Inputs are finite local/world coordinates. A zero-length segment is a point.
 * No radius sampling: edge, vertex and face-interior closest pairs are covered.
 */
export function segmentTriangleDistanceSquared(start: Vec3, end: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  let best = Math.min(
    segmentsSquared(start, end, a, b),
    segmentsSquared(start, end, b, c),
    segmentsSquared(start, end, c, a)
  );
  const normal = cross(sub(b, a), sub(c, a)),
    areaSquared = squared(normal);
  if (areaSquared === 0) return best;
  const startPlane = dot(sub(start, a), normal),
    endPlane = dot(sub(end, a), normal);
  // A segment can pierce the face without approaching any triangle edge.
  if ((startPlane <= 0 && endPlane >= 0) || (startPlane >= 0 && endPlane <= 0)) {
    const denominator = startPlane - endPlane;
    if (denominator !== 0) {
      const point = add(start, scale(sub(end, start), startPlane / denominator));
      if (inside(point, a, b, c, normal)) return 0;
    }
  }
  for (const [point, plane] of [
    [start, startPlane],
    [end, endPlane]
  ] as const) {
    const projected = sub(point, scale(normal, plane / areaSquared));
    if (inside(projected, a, b, c, normal)) best = Math.min(best, (plane * plane) / areaSquared);
  }
  return best;
}

type BoundsPoint = readonly [number, number, number];

/** Clip one final world-space triangle to a closed query box. Holes and detached surfaces remain empty. */
export function triangleIntersectsBounds(
  a: BoundsPoint,
  b: BoundsPoint,
  c: BoundsPoint,
  min: BoundsPoint,
  max: BoundsPoint
): boolean {
  let polygon: BoundsPoint[] = [a, b, c];
  for (let axis = 0; axis < 3; axis++)
    for (const side of [0, 1]) {
      const value = side === 0 ? min[axis] : max[axis];
      const inside = (p: BoundsPoint) => (side === 0 ? p[axis] >= value : p[axis] <= value);
      const clipped: BoundsPoint[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i],
          q = polygon[(i + 1) % polygon.length];
        const pin = inside(p),
          qin = inside(q);
        if (pin) clipped.push(p);
        if (pin !== qin) {
          const t = (value - p[axis]) / (q[axis] - p[axis]);
          clipped.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
        }
      }
      if (!clipped.length) return false;
      polygon = clipped;
    }
  return true;
}
