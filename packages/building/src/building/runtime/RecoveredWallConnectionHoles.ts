/** Original shape arclength and connection hole boundary.
 * ShapeParameters::as_curve2 0x10166f268 uses circle spacing .2.
 * This is distinct from the terrain/publisher resampling profile. */
import { add, sub, mul, div, sqrt, f32, RoofCurve } from "./RecoveredRoofMath";
import type {
  ConnectionXZ,
  WallConnectionShape,
  WallConnectionCrossing,
  WallConnectionWipHole,
  WallConnectionFinalHole
} from "./WallConnectionTypes";
export function shapeCurve(shape: WallConnectionShape, spacing = 0.2): RoofCurve {
  if (!Number.isFinite(spacing) || spacing <= 0 || shape.center.some((v) => !Number.isFinite(v)))
    throw Error("Finite shape and positive spacing required");
  if (shape.type === "rectangle") {
    if (
      !Number.isFinite(shape.width) ||
      !Number.isFinite(shape.depth) ||
      shape.width <= 0 ||
      shape.depth <= 0 ||
      shape.orientation.some((v) => !Number.isFinite(v))
    )
      throw Error("Positive rectangle dimensions required");
    const w = mul(shape.width, 0.5),
      d = mul(shape.depth, 0.5),
      [c, s] = shape.orientation;
    return new RoofCurve(
      [
        [-w, -d],
        [-w, d],
        [w, d],
        [w, -d],
        [-w, -d]
      ].map(([x, z]) => [
        add(shape.center[0], sub(mul(c, x), mul(s, z))),
        add(shape.center[1], add(mul(s, x), mul(c, z)))
      ])
    );
  }
  if (!Number.isFinite(shape.radius) || shape.radius <= 0 || !Number.isFinite(shape.phase))
    throw Error("Finite circle with positive radius required");
  const tau = f32(Math.PI * 2),
    count = Math.max(3, Math.ceil(div(mul(shape.radius, tau), spacing)));
  let phase = f32(f32(shape.phase) % tau);
  if (phase < 0) phase = add(phase, tau);
  return new RoofCurve(
    Array.from({ length: count }, (_, i) => {
      const u = div(i, count - 1),
        angle = add(mul(sub(1, u), tau), phase);
      return [
        add(shape.center[0], mul(shape.radius, f32(Math.cos(angle)))),
        add(shape.center[1], mul(shape.radius, f32(Math.sin(angle))))
      ];
    })
  );
}
function projectU(curve: RoofCurve, p: ConnectionXZ): number {
  let best = Infinity,
    coord = 0;
  for (let i = 0; i < curve.points.length - 1; i++) {
    const a = curve.points[i],
      b = curve.points[i + 1],
      dx = sub(b[0], a[0]),
      dz = sub(b[1], a[1]),
      qx = sub(p[0], a[0]),
      qz = sub(p[1], a[1]);
    const t = Math.min(1, Math.max(0, div(add(mul(qx, dx), mul(qz, dz)), add(mul(dx, dx), mul(dz, dz)))));
    const rx = sub(qx, mul(dx, t)),
      rz = sub(qz, mul(dz, t)),
      distance = add(mul(rx, rx), mul(rz, rz));
    if (distance < best) {
      best = distance;
      coord = mul(add(curve.knots[i], mul(t, sub(curve.knots[i + 1], curve.knots[i]))), curve.length);
    }
  }
  return coord;
}
export function connectionHoleBetween(
  shape: WallConnectionShape,
  start: ConnectionXZ,
  end: ConnectionXZ,
  minY: number,
  maxY = 10000,
  publishedCurve?: RoofCurve
): WallConnectionWipHole | undefined {
  const curve = publishedCurve ?? connectionShapeCurve(shape),
    a = projectU(curve, start),
    b = projectU(curve, end);
  let width = sub(b, a);
  if (width < 0) width = add(width, curve.length);
  if (width <= 0) return;
  let centerU = add(a, mul(width, 0.5));
  if (centerU >= curve.length) centerU = sub(centerU, curve.length);
  return { centerU, centerY: mul(add(minY, maxY), 0.5), width, height: sub(maxY, minY), kind: 1 };
}
/** Crossing order/labels are the original geometry branch's traversal. */
export function connectionHolesFromCrossings(
  shape: WallConnectionShape,
  events: readonly WallConnectionCrossing[],
  side: 0 | 1,
  minY: number
): WallConnectionWipHole[] {
  const out: WallConnectionWipHole[] = [];
  for (let i = 0; i < events.length; i++) {
    const a = events[i],
      b = events[(i + 1) % events.length];
    if (a.crossingKind === side && b.crossingKind !== side) {
      const hole = connectionHoleBetween(shape, a.point, b.point, minY);
      if (hole) out.push(hole);
    }
  }
  return out;
}
/** Original finalize converts center/dimensions to AABBs, retains overhang and
 * emits one wrapped copy when the cyclic wall-space seam is crossed. */
export function finalizeWallConnectionHoles(
  holes: readonly WallConnectionWipHole[],
  length: number,
  closed = true
): WallConnectionFinalHole[] {
  const out: WallConnectionFinalHole[] = [];
  for (const h of holes) {
    const halfU = mul(h.width, 0.5),
      halfY = mul(h.height, 0.5),
      v = {
        minU: sub(h.centerU, halfU),
        minY: sub(h.centerY, halfY),
        maxU: add(h.centerU, halfU),
        maxY: add(h.centerY, halfY),
        kind: h.kind,
        seamCopy: false
      };
    out.push(v);
    if (closed) {
      if (v.minU < 0) out.push({ ...v, minU: add(v.minU, length), maxU: add(v.maxU, length), seamCopy: true });
      else if (v.maxU > length)
        out.push({ ...v, minU: sub(v.minU, length), maxU: sub(v.maxU, length), seamCopy: true });
    }
  }
  // Original hole ordering compares centerU + halfWidth (the finalized maxU).
  return out.sort((a, b) => a.maxU - b.maxU);
}

/** Detection uses the original .2 spacing, independent of publisher sampling. */
export function connectionShapeCurve(shape: WallConnectionShape): RoofCurve {
  return shapeCurve(shape, 0.2);
}
