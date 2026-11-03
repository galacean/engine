/** Semantic port of Tiny Glade 0x100969fec (flat/pitched detector),
 * roof_shape_at_intersection_y and 0x100918218 (merlon constructor).
 * Source: 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * The host owns dirty scheduling. No native execution or captured placements.
 */
import {
  f32,
  add,
  sub,
  mul,
  div,
  lerp,
  roofHeight,
  isCircle,
  RoofCurve,
  RoofRandom,
  randomSplits
} from "./RecoveredRoofMath";
import type { RoofSurface, RoofFootprint } from "./RecoveredRoofMath";
import type { WallConnectionShape, WallConnectionWipHole, ConnectionXZ } from "./WallConnectionTypes";
import {
  expandedConnectionShape,
  circleCircleCrossings,
  circleRectangleCrossings,
  rectangleRectangleCrossings
} from "./RecoveredWallConnections";
import { connectionShapeCurve, connectionHoleBetween, shapeCurve } from "./RecoveredWallConnectionHoles";
import { encodeBrick96 } from "./UnitPacking.js";
import { IDENTITY_UNIT_SCALE, type UnitFootprintScale } from "./MaterialFootprint";

export interface InterRoofOwner {
  nativeId: bigint;
  /** Host random appearance seed, independent of connection identity. */
  seed?: bigint;
  /** Host target specifications; omitted values preserve native packing. */
  roofUnitScale?: UnitFootprintScale;
  roofSeed?: bigint;
  slot: number;
  shape: WallConnectionShape;
  roof: { surface: RoofSurface; footprint: RoofFootprint };
  building: { id: string; kind?: string; material: number };
  profile?: { projected: RoofCurve };
}
export interface InterRoofMerlonCandidate {
  flatId: bigint;
  pitchedId: bigint;
  shape: WallConnectionShape;
  start: number;
  end: number;
  y: number;
}

/** Native cross section uses the unflared owner footprint, not tile skin. */
export function roofShapeAtIntersectionY(
  surface: RoofSurface,
  footprint: RoofFootprint,
  y: number
): WallConnectionShape | null {
  const shape: WallConnectionShape = isCircle(footprint)
    ? {
        type: "circle",
        center: [...footprint.center] as ConnectionXZ,
        radius: footprint.radius,
        phase: footprint.phase
      }
    : {
        type: "rectangle",
        center: [...footprint.center] as ConnectionXZ,
        orientation: [...footprint.orientation] as ConnectionXZ,
        width: footprint.width,
        depth: footprint.depth
      };
  const base = f32(surface.base_height),
    height = roofHeight(surface, footprint);
  if (f32(y) === base) return shape;
  if (y < base || y >= add(base, height) || height === 0) return null;
  const fraction = div(sub(y, base), height);
  const exponent = div(1, add(mul(surface.profile, 1.5), mul(sub(1, surface.profile), 0.5)));
  const t = f32(Math.pow(fraction, exponent));
  if (shape.type === "circle") return { ...shape, radius: mul(sub(1, t), shape.radius) };
  const ridge = lerp(0.1, surface.axis === 0 ? shape.width : shape.depth, surface.ridge_parameter);
  return {
    ...shape,
    width: lerp(shape.width, surface.axis === 0 ? ridge : 0.1, t),
    depth: lerp(shape.depth, surface.axis === 0 ? 0.1 : ridge, t)
  };
}
const wrap = (u: number) => ((u % 1) + 1) % 1;
function contains(shape: WallConnectionShape, p: readonly number[]) {
  const x = p[0] - shape.center[0],
    z = p[1] - shape.center[1];
  if (shape.type === "circle") return x * x + z * z < shape.radius * shape.radius;
  const [c, s] = shape.orientation;
  return Math.abs(c * x + s * z) < shape.width / 2 && Math.abs(c * z - s * x) < shape.depth / 2;
}
function perimeter(shape: WallConnectionShape) {
  return shape.type === "circle" ? mul(shape.radius, f32(Math.PI * 2)) : mul(add(shape.width, shape.depth), 2);
}
/** ShapeParameters closest U is analytic, whereas construction samples the
 * original .2 metre curve. Keeping these separate preserves circular semantics. */
function shapeU(shape: WallConnectionShape, p: ConnectionXZ) {
  if (shape.type === "circle")
    return wrap((shape.phase - Math.atan2(p[1] - shape.center[1], p[0] - shape.center[0])) / (Math.PI * 2));
  const curve = connectionShapeCurve(shape);
  let best = Infinity,
    result = 0;
  for (let i = 0; i + 1 < curve.points.length; i++) {
    const a = curve.points[i],
      b = curve.points[i + 1],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    const distance = Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
    if (distance < best) {
      best = distance;
      result = lerp(curve.knots[i], curve.knots[i + 1], t);
    }
  }
  return result;
}
function crossings(a: WallConnectionShape, b: WallConnectionShape) {
  if (a.type === "circle" && b.type === "circle" && a.center.every((v, i) => v === b.center[i])) return [];
  return a.type === "rectangle" && b.type === "rectangle"
    ? rectangleRectangleCrossings(a, b)
    : a.type === "circle" && b.type === "circle"
      ? circleCircleCrossings(a, b)
      : circleRectangleCrossings(a, b);
}
function insideArcs(shape: WallConnectionShape, other: WallConnectionShape, points: ConnectionXZ[]) {
  const curve = connectionShapeCurve(shape);
  const us = [...new Set(points.map((p) => shapeU(shape, p)))].sort((a, b) => a - b);
  const arcs: [number, number][] = [];
  for (let i = 0; i < us.length; i++) {
    const start = us[i],
      end = us[(i + 1) % us.length] + (i + 1 === us.length ? 1 : 0);
    if (end - start > 1e-7 && contains(other, curve.sample(wrap((start + end) / 2)))) arcs.push([start, end]);
  }
  return arcs;
}
function slice(shape: WallConnectionShape, start: number, end: number) {
  const curve = connectionShapeCurve(shape),
    stop = end > start ? end : end + 1;
  const points = [curve.sample(wrap(start))];
  for (let cycle = 0; cycle <= 1; cycle++)
    for (let i = 1; i < curve.knots.length; i++) {
      const u = cycle + curve.knots[i];
      if (u > start && u < stop) points.push(curve.points[i]);
    }
  points.push(curve.sample(wrap(stop)));
  return new RoofCurve(points);
}
/** Original line_x_shape_overlap clips an infinite edge ray, then applies .875m
 * corner clearance only when the overlap extends beyond that edge endpoint. */
function lineInterval(a: number[], b: number[], shape: WallConnectionShape): [number, number] | null {
  const x = a[0] - shape.center[0],
    z = a[1] - shape.center[1],
    dx = b[0] - a[0],
    dz = b[1] - a[1];
  if (shape.type === "circle") {
    const aa = dx * dx + dz * dz,
      bb = 2 * (x * dx + z * dz),
      cc = x * x + z * z - shape.radius * shape.radius;
    const determinant = bb * bb - 4 * aa * cc;
    if (determinant < 0 || aa === 0) return null;
    const root = Math.sqrt(determinant);
    return [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)];
  }
  const [c, s] = shape.orientation;
  let lo = -Infinity,
    hi = Infinity;
  for (const [origin, direction, half] of [
    [c * x + s * z, c * dx + s * dz, shape.width / 2],
    [c * z - s * x, c * dz - s * dx, shape.depth / 2]
  ]) {
    if (Math.abs(direction) < 1e-12) {
      if (Math.abs(origin) > half) return null;
      continue;
    }
    const first = (-half - origin) / direction,
      last = (half - origin) / direction;
    lo = Math.max(lo, Math.min(first, last));
    hi = Math.min(hi, Math.max(first, last));
  }
  return hi >= lo ? [lo, hi] : null;
}

export function constructInterRoofMerlonCandidate(candidate: InterRoofMerlonCandidate, flat: InterRoofOwner) {
  const curve = slice(candidate.shape, candidate.start, candidate.end),
    length = curve.length;
  const target = flat.roofUnitScale ?? IDENTITY_UNIT_SCALE;
  const rng = new RoofRandom(flat.roofSeed ?? BigInt(Math.trunc(mul(length, 1000))));
  const split = randomSplits(
    Math.max(2, Math.ceil(div(length, mul(0.46, target.width))) + 1),
    div(mul(0.32, target.width), length),
    rng
  );
  const bricks: { packed64: Uint8Array; domain96: Uint8Array }[] = [],
    beams: { packed80: Uint8Array }[] = [];
  const placements: {
    position: number[];
    scale: number[];
    basis: number[][];
    row: number;
    u: number;
    unit: "brick" | "wooden_plank";
  }[] = [];
  // The recovered chained windows iterator repeats its first lower-row segment
  // before traversing alternate upper-row segments. Preserve its RNG/order.
  const segments = [...split.slice(0, -1).map((_, i) => ({ i, row: 0 })), { i: 0, row: 0 }];
  if (flat.roof.surface.edge_mode !== 1)
    for (let i = split.length % 2 ? 1 : 2; i + 1 < split.length; i += 2) segments.push({ i, row: 1 });
  let nativeOrdinal = 0;
  for (const { i, row } of segments) {
    const a = curve.sample(split[i]),
      b = curve.sample(split[i + 1]);
    const dx = sub(b[0], a[0]),
      dz = sub(b[1], a[1]),
      width = f32(Math.hypot(dx, dz));
    if (!(width > 0)) continue;
    const height = row ? add(mul(mul(sub(rng.next(), 0.5), 0.21), 0.8), 0.368) : f32(0.23);
    const depth = mul(add(mul(sub(rng.next(), 0.5), 0.07), 0.28), target.depth);
    const y = row ? add(add(candidate.y, 0.23), mul(height, 0.5)) : add(candidate.y, 0.115);
    // A merlon's height is a structural silhouette, not a unit specification.
    // Subdivide its original envelope without consuming more native randomness.
    const subdivisions = Math.max(1, Math.ceil(div(height, mul(row ? 0.46 : 0.23, target.height))));
    const pieceHeight = subdivisions === 1 ? height : div(height, subdivisions);
    const ordinal = row ? split.length - 1 + i : nativeOrdinal;
    nativeOrdinal++;
    for (let subdivision = 0; subdivision < subdivisions; subdivision++) {
      const pieceY = subdivisions === 1 ? y : add(sub(y, mul(height, 0.5)), mul(pieceHeight, subdivision + 0.5));
      const position = [mul(add(a[0], b[0]), 0.5), pieceY, mul(add(a[1], b[1]), 0.5)];
      const basis = [
        [div(dx, width), 0, div(dz, width)],
        [0, 1, 0],
        [-div(dz, width), 0, div(dx, width)]
      ];
      const scale = [width, pieceHeight, depth];
      const unit = flat.building.material === 1 ? "wooden_plank" : "brick";
      placements.push({ position, scale, basis, row, u: split[i], unit });
      if (unit === "brick") {
        const domain96 = new Uint8Array(96),
          v = new DataView(domain96.buffer);
        [...basis.flatMap((axis, k) => axis.map((n) => mul(n, scale[k]))), ...position].forEach((n, k) =>
          v.setFloat32(k * 4, n, true)
        );
        [64, 68, 72].forEach((k) => v.setFloat32(k, -100, true));
        v.setUint32(80, flat.slot, true);
        v.setFloat32(84, mul(length, split[i]), true);
        v.setFloat32(88, mul(length, split[i]), true);
        v.setUint32(92, 4, true);
        bricks.push({ domain96, packed64: encodeBrick96(domain96) });
      } else {
        const packed80 = new Uint8Array(80),
          v = new DataView(packed80.buffer);
        const axes = [
          basis[2].map((n) => mul(n, depth)),
          basis[0].map((n) => mul(n, width)),
          basis[1].map((n) => mul(n, pieceHeight))
        ];
        const origin = position.map(
          (n, k) =>
            add(n, mul(axes[1][k], -0.5)) - (k === 1 ? 0.08 * (subdivisions === 1 ? 1 : pieceHeight / height) : 0)
        );
        [...axes.flat(), ...origin].forEach((n, k) => v.setFloat32(k * 4, n, true));
        v.setUint32(48, Number((flat.roofSeed ?? flat.seed ?? flat.nativeId) & 0xffffffffn), true);
        v.setUint32(52, ordinal + subdivision * segments.length, true);
        v.setUint32(56, flat.slot, true);
        v.setUint32(60, 225, true);
        beams.push({ packed80 });
      }
    }
  }
  return { candidate, placements, bricks, beams };
}

export function generateInterRoofMerlons(owners: readonly InterRoofOwner[]) {
  const candidates: InterRoofMerlonCandidate[] = [];
  const holes = new Map<bigint, WallConnectionWipHole[]>();
  const flatOwners = owners.filter((o) => !o.building.kind && o.roof.surface.height_parameter <= f32(0.1));
  const pitchedOwners = owners.filter((o) => !o.building.kind && o.roof.surface.height_parameter > f32(0.1));
  for (const flat of flatOwners)
    for (const pitched of pitchedOwners) {
      const y = sub(flat.roof.surface.base_height, 0.67);
      const section = roofShapeAtIntersectionY(pitched.roof.surface, pitched.roof.footprint, y);
      if (!section) continue;
      const roofShape = expandedConnectionShape(section, 0.515),
        flatShape = expandedConnectionShape(flat.shape, 0.315);
      const events = crossings(flatShape, roofShape),
        points = events.map((e) => e.point);
      if (points.length < 2) continue;
      for (const [start, end] of insideArcs(flatShape, roofShape, points)) {
        const pointAt = (u: number) =>
          points.reduce((a, b) => {
            const distance = (p: ConnectionXZ) => Math.abs(wrap(shapeU(flatShape, p) - u + 0.5) - 0.5);
            return distance(a) <= distance(b) ? a : b;
          });
        // Native holes live on the published wall-space curve (.5m control
        // sampling), not the more finely sampled .2m detector/merlon curve.
        const hole = connectionHoleBetween(
          flat.shape,
          pointAt(start),
          pointAt(end),
          y,
          flat.roof.surface.base_height,
          flat.profile?.projected ?? shapeCurve(flat.shape, 0.5)
        );
        if (hole) {
          if (!holes.has(flat.nativeId)) holes.set(flat.nativeId, []);
          holes.get(flat.nativeId)!.push(hole);
        }
      }
      const p = perimeter(roofShape);
      if (roofShape.type === "rectangle" && f32(pitched.roof.surface.ridge_parameter) === 1) {
        const curve = connectionShapeCurve(roofShape);
        for (let edge = 0; edge < 4; edge++) {
          if (edge % 2 === pitched.roof.surface.axis) continue;
          const interval = lineInterval(curve.points[edge], curve.points[edge + 1], flatShape);
          if (!interval || interval[0] > 1 || interval[1] < 0) continue;
          const start =
            interval[0] < 0
              ? add(curve.knots[edge], div(0.875, p))
              : lerp(curve.knots[edge], curve.knots[edge + 1], interval[0]);
          const end =
            interval[1] > 1
              ? sub(curve.knots[edge + 1], div(0.875, p))
              : lerp(curve.knots[edge], curve.knots[edge + 1], interval[1]);
          if (end - start >= div(0.46, p))
            candidates.push({ flatId: flat.nativeId, pitchedId: pitched.nativeId, shape: roofShape, start, end, y });
        }
        continue;
      }
      for (const [start, end] of insideArcs(roofShape, flatShape, points)) {
        const first = add(start, div(0.315, p)),
          last = sub(end, div(0.315, p));
        if (last - first < div(0.2, p)) continue;
        candidates.push({
          flatId: flat.nativeId,
          pitchedId: pitched.nativeId,
          shape: roofShape,
          start: f32(wrap(first)),
          end: f32(wrap(last)),
          y
        });
      }
    }
  const byId = new Map(owners.map((o) => [o.nativeId, o]));
  const groups = candidates.map((c) => constructInterRoofMerlonCandidate(c, byId.get(c.flatId)!));
  return { candidates, holes, groups, bricks: groups.flatMap((g) => g.bricks), beams: groups.flatMap((g) => g.beams) };
}
