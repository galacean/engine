/** Recovered analytic circle/rectangle branches of 0x10090d8ac
 * and closure 0x10090ef0c. No native execution or scene output is consumed. */
import { add, sub, mul, div, sqrt, f32 } from "./RecoveredRoofMath";
import { IDENTITY_UNIT_SCALE } from "./MaterialFootprint";
import type {
  ConnectionXZ,
  WallConnectionShape,
  WallConnectionCrossing,
  WallConnectionOwner,
  WallStitchCandidate
} from "./WallConnectionTypes";
const dot = (a: ConnectionXZ, b: ConnectionXZ) => add(mul(a[0], b[0]), mul(a[1], b[1]));
const delta = (a: ConnectionXZ, b: ConnectionXZ): ConnectionXZ => [sub(a[0], b[0]), sub(a[1], b[1])];
const norm = (d: ConnectionXZ): ConnectionXZ => {
  const inv = div(1, sqrt(dot(d, d)));
  return [mul(d[0], inv), mul(d[1], inv)];
};
export function expandedConnectionShape(s: WallConnectionShape, margin = 0.28): WallConnectionShape {
  return s.type === "circle"
    ? { ...s, radius: add(s.radius, margin) }
    : { ...s, width: add(s.width, add(margin, margin)), depth: add(s.depth, add(margin, margin)) };
}
function rectanglePoints(s: Extract<WallConnectionShape, { type: "rectangle" }>): ConnectionXZ[] {
  const [c, t] = s.orientation,
    w = mul(s.width, 0.5),
    d = mul(s.depth, 0.5);
  return [
    [-w, -d],
    [-w, d],
    [w, d],
    [w, -d]
  ].map(([x, z]) => [add(s.center[0], sub(mul(c, x), mul(t, z))), add(s.center[1], add(mul(t, x), mul(c, z)))]);
}
/** Circle2d::intersect_circle 0x101ff7144, followed by original circle/circle
 * tangents in 0x10090d8ac. Keep both native events at exact tangency: their
 * crossing labels and directions differ even when the points are identical.
 * The optional endpoint-distance lane is absent for tag 0, normalized to zero.
 */
export function circleCircleCrossings(a: WallConnectionShape, b: WallConnectionShape): WallConnectionCrossing[] {
  if (a.type !== "circle" || b.type !== "circle") throw Error("Circle pair required");
  const q = delta(b.center, a.center),
    distance = sqrt(dot(q, q));
  if (distance > add(a.radius, b.radius) || distance < Math.abs(sub(a.radius, b.radius))) return [];
  if (distance === 0) throw Error("Coincident circle boundaries have no finite native crossing solution");
  const r2 = mul(a.radius, a.radius),
    along = div(add(sub(r2, mul(b.radius, b.radius)), mul(distance, distance)), add(distance, distance));
  const height = sqrt(sub(r2, mul(along, along))),
    scale = div(along, distance),
    normalScale = div(height, distance);
  const mid: ConnectionXZ = [add(a.center[0], mul(q[0], scale)), add(a.center[1], mul(q[1], scale))];
  const perpendicular: ConnectionXZ = [mul(-q[1], normalScale), mul(q[0], normalScale)];
  return [1, -1].map((sign, index) => {
    const point: ConnectionXZ =
      index === 0
        ? [add(mid[0], perpendicular[0]), add(mid[1], perpendicular[1])]
        : [sub(mid[0], perpendicular[0]), sub(mid[1], perpendicular[1])];
    const ra = norm(delta(point, a.center)),
      rb = norm(delta(point, b.center));
    return {
      point,
      directions: [
        [mul(-ra[1], sign), mul(ra[0], sign)],
        [mul(rb[1], sign), mul(-rb[0], sign)]
      ] as [ConnectionXZ, ConnectionXZ],
      tag: 0,
      endpointDistance: 0,
      crossingKind: index as 0 | 1
    };
  });
}
export function circleRectangleCrossings(a: WallConnectionShape, b: WallConnectionShape): WallConnectionCrossing[] {
  if (a.type === b.type) throw Error("Only independently recovered circle/rectangle crossing branch is enabled");
  const circle = (a.type === "circle" ? a : b) as Extract<WallConnectionShape, { type: "circle" }>;
  const rect = (a.type === "rectangle" ? a : b) as Extract<WallConnectionShape, { type: "rectangle" }>;
  const corners = rectanglePoints(rect),
    out: WallConnectionCrossing[] = [];
  for (let i = 0; i < 4; i++) {
    const start = corners[i],
      end = corners[(i + 1) % 4],
      d = delta(end, start),
      q = delta(start, circle.center),
      A = dot(d, d),
      B = mul(dot(q, d), 2),
      C = sub(dot(q, q), mul(circle.radius, circle.radius));
    const disc = add(mul(B, B), mul(mul(A, -4), C));
    if (disc < 0) continue;
    const root = sqrt(disc),
      ts = [div(sub(-B, root), add(A, A)), div(sub(root, B), add(A, A))],
      direction = norm(d);
    ts.forEach((t, j) => {
      if (t < 0 || t > 1) return;
      const point: ConnectionXZ = [add(start[0], mul(d[0], t)), add(start[1], mul(d[1], t))],
        radial = norm(delta(point, circle.center));
      const sign = j === 0 ? -1 : 1;
      const circleDirection: ConnectionXZ = [mul(-radial[1], sign), mul(radial[0], sign)];
      const rectDirection: ConnectionXZ = [mul(direction[0], sign), mul(direction[1], sign)];
      const endpointDistance = Math.min(...corners.map((p) => sqrt(dot(delta(point, p), delta(point, p)))), 100);
      out.push({
        point,
        directions: [circleDirection, rectDirection],
        tag: 1,
        endpointDistance,
        crossingKind: ((a.type === "rectangle" ? 1 : 0) ^ (j === 0 ? 1 : 0)) as 0 | 1
      });
    });
  }
  return out;
}
function sampledAt(owner: WallConnectionOwner, p: ConnectionXZ, values: number[]): number {
  if (owner.points.length < 2 || values.length !== owner.points.length)
    throw Error("Current published wall profile required");
  let best = Infinity,
    index = 0,
    weight = 0;
  for (let i = 0; i < owner.points.length - 1; i++) {
    const a: ConnectionXZ = [owner.points[i][0], owner.points[i][2]],
      b: ConnectionXZ = [owner.points[i + 1][0], owner.points[i + 1][2]],
      d = delta(b, a),
      q = delta(p, a);
    const t = Math.max(0, Math.min(1, div(dot(q, d), dot(d, d))));
    const residual: ConnectionXZ = [sub(q[0], mul(d[0], t)), sub(q[1], mul(d[1], t))],
      distance = dot(residual, residual);
    if (distance < best) {
      best = distance;
      index = i;
      weight = t;
    }
  }
  return add(values[index], mul(weight, sub(values[index + 1], values[index])));
}
function foundationY(w: WallConnectionOwner): number | undefined {
  if (w.material !== 1 || w.foundationOffset <= 0) return undefined;
  return Math.max(w.baseY, add(Math.min(...w.points.map((p) => p[1])), w.foundationOffset));
}
function stitchKind(w: WallConnectionOwner, y: number): number {
  if (w.style === 2) return 2;
  if (w.material === 0) return 0;
  const f = foundationY(w);
  return f !== undefined && y < f ? 1 : 3;
}
export function candidatesAtCrossings(
  a: WallConnectionOwner,
  b: WallConnectionOwner,
  crossings: readonly WallConnectionCrossing[],
  terrainHeight: (p: ConnectionXZ) => number
): WallStitchCandidate[] {
  const out: WallStitchCandidate[] = [];
  // A junction has two owners. Blend their target spans symmetrically so a
  // local specification edit cannot depend on pair iteration/selection order.
  const as = a.unitScale ?? IDENTITY_UNIT_SCALE,
    bs = b.unitScale ?? IDENTITY_UNIT_SCALE;
  const unitScale = {
    width: mul(add(as.width, bs.width), 0.5),
    height: mul(add(as.height, bs.height), 0.5),
    depth: mul(add(as.depth, bs.depth), 0.5)
  };
  for (const x of crossings) {
    const terrain = f32(terrainHeight(x.point)),
      third = sampledAt(a, x.point, a.third);
    const bottom = Math.max(add(add(third, third > 0 ? 0.46 : 0), a.baseY), b.baseY, terrain);
    const top = Math.min(
      sub(sampledAt(a, x.point, a.top), a.flatRoof ? 0.67 : 0),
      sub(sampledAt(b, x.point, b.top), b.flatRoof ? 0.67 : 0)
    );
    if (!(bottom < top)) continue;
    const ys = [bottom, top];
    for (const w of [a, b]) {
      const f = foundationY(w);
      if (f !== undefined && bottom < f && f < top) ys.push(f);
    }
    ys.sort((x, y) => x - y);
    const unique = ys.filter((y, i) => !i || Math.abs(sub(y, ys[i - 1])) > 1.1920928955078125e-7);
    for (let i = 1; i < unique.length; i++) {
      const minY = unique[i - 1],
        maxY = unique[i],
        mid = mul(add(minY, maxY), 0.5),
        kinds: [number, number] = [stitchKind(a, mid), stitchKind(b, mid)];
      out.push({
        ...x,
        ...(a.unitScale || b.unitScale ? { unitScale } : {}),
        minY,
        maxY,
        wallIds: [a.id, b.id],
        ...(a.seed === undefined && b.seed === undefined
          ? {}
          : { wallSeeds: [a.seed ?? a.id, b.seed ?? b.id] as [bigint, bigint] }),
        terrainY: terrain,
        kinds,
        beam: kinds.some((k) => k > 1)
      });
    }
  }
  return out;
}
function closestRectangleNormal(points: ConnectionXZ[], p: ConnectionXZ): ConnectionXZ {
  let best = Infinity,
    result: ConnectionXZ = [0, 0];
  for (let i = 0; i < 4; i++) {
    const a = points[i],
      d = delta(points[(i + 1) % 4], a),
      q = delta(p, a),
      t = Math.max(0, Math.min(1, div(dot(q, d), dot(d, d))));
    const r: ConnectionXZ = [sub(q[0], mul(d[0], t)), sub(q[1], mul(d[1], t))],
      distance = dot(r, r);
    if (distance < best) {
      best = distance;
      const tangent = norm(d);
      result = [-tangent[1], tangent[0]];
    }
  }
  return result;
}
/** Rectangle branch: segment B against A's oriented AABB, in native B edge order. */
export function rectangleRectangleCrossings(a: WallConnectionShape, b: WallConnectionShape): WallConnectionCrossing[] {
  if (a.type !== "rectangle" || b.type !== "rectangle") throw Error("Rectangle pair required");
  const ap = rectanglePoints(a),
    bp = rectanglePoints(b),
    [c, s] = a.orientation;
  const local = (p: ConnectionXZ): ConnectionXZ => {
    const q = delta(p, a.center);
    return [add(mul(c, q[0]), mul(s, q[1])), sub(mul(c, q[1]), mul(s, q[0]))];
  };
  const out: WallConnectionCrossing[] = [];
  for (let i = 0; i < 4; i++) {
    const start = bp[i],
      end = bp[(i + 1) % 4],
      worldDelta = delta(end, start),
      origin = local(start),
      finish = local(end),
      direction = delta(finish, origin),
      bt = norm(worldDelta),
      half = [mul(a.width, 0.5), mul(a.depth, 0.5)];
    let near = -Infinity,
      far = Infinity,
      nearAxis = 0,
      farAxis = 0,
      miss = false;
    for (let axis = 0; axis < 2; axis++) {
      if (direction[axis] === 0) {
        if (Math.abs(origin[axis]) > half[axis]) miss = true;
        continue;
      }
      let lo = div(sub(-half[axis], origin[axis]), direction[axis]),
        hi = div(sub(half[axis], origin[axis]), direction[axis]);
      if (lo > hi) [lo, hi] = [hi, lo];
      if (lo > near) {
        near = lo;
        nearAxis = axis;
      }
      if (hi < far) {
        far = hi;
        farAxis = axis;
      }
    }
    if (miss || near > far) continue;
    [near, far].forEach((t, j) => {
      if (t < 0 || t > 1) return;
      const p: ConnectionXZ = [add(start[0], mul(worldDelta[0], t)), add(start[1], mul(worldDelta[1], t))];
      const axis = j ? farAxis : nearAxis,
        localPoint = local(p),
        sign = localPoint[axis] < 0 ? -1 : 1;
      const an: ConnectionXZ = axis === 0 ? [mul(c, sign), mul(s, sign)] : [mul(-s, sign), mul(c, sign)];
      if (dot(closestRectangleNormal(ap, p), closestRectangleNormal(bp, p)) >= f32(0.9)) return;
      const tangentA: ConnectionXZ = [an[1], -an[0]],
        factor = j ? 1 : -1;
      const directions: [ConnectionXZ, ConnectionXZ] = [
        [mul(-tangentA[0], factor), mul(-tangentA[1], factor)],
        [mul(bt[0], factor), mul(bt[1], factor)]
      ];
      const endpointDistance = Math.min(100, ...[...ap, ...bp].map((q) => sqrt(dot(delta(p, q), delta(p, q)))));
      out.push({ point: p, directions, tag: 1, endpointDistance, crossingKind: j as 0 | 1 });
    });
  }
  return out;
}
