import { add, sub, mul, div, sqrt, f32, lerp, type RoofCurve } from "./RecoveredRoofMath";

/** Host author scaling must not alias one attachment onto multiple wall laps.
 * This validates an interval before native endpoint projection; it does not
 * change project_clamp, which also handles legitimate seam-crossing points. */
export class ClosedWallSpanError extends RangeError {
  constructor(
    readonly span: number,
    readonly length: number
  ) {
    super("Decoration attachment span must be smaller than the closed wall perimeter");
  }
}
export function assertClosedWallSpan(span: number, length: number, closed: boolean): void {
  if (closed && !(f32(span) < f32(length))) throw new ClosedWallSpanError(f32(span), f32(length));
}

/** Native WallSpace::project_clamp (0x102000d34). Its length belongs to
 * WallSpace, independently of the polyline's length used by to_world_space. */
export function projectWallArclength(arclength: number, wallSpaceLength: number, closed: boolean): number {
  const x = f32(arclength),
    span = f32(wallSpaceLength);
  if (!Number.isFinite(x) || !Number.isFinite(span) || span <= 0)
    throw Error("Finite arclength and positive wall-space length required");
  let projected = closed ? f32(x % span) : Math.min(span, Math.max(0, x));
  if (closed && projected < 0) projected = add(projected, span);
  return projected;
}

/** Original to_world_space (0x102000a14). Projection and sampling are separate:
 * values outside the polyline extrapolate along its twice-normalized tangent.
 * The negative branch deliberately subtracts x (original direct-call oracle);
 * normal Cottage endpoints are projected nonnegative before reaching it. */
export function sampleWallArclength(curve: RoofCurve, arclength: number): number[] {
  const x = f32(arclength);
  if (!Number.isFinite(x)) throw Error("Finite wall arclength required");
  const u = div(x, curve.length),
    point = curve.sample(u);
  if (x >= 0 && x <= curve.length) return point;
  const tangent = curve.tangent(u);
  const inverse = div(1, sqrt(add(mul(tangent[0], tangent[0]), mul(tangent[1], tangent[1]))));
  const delta = x > curve.length ? sub(x, curve.length) : x;
  return point.map((p, i) =>
    x > curve.length ? add(p, mul(mul(tangent[i], inverse), delta)) : sub(p, mul(mul(tangent[i], inverse), delta))
  );
}

/** Original planar get_approx_u_from_pos (0x1011168ac). Tangent consumers
 * resolve this returned knot coordinate again; a shared vertex can select the
 * next segment rather than the closest-point search's earlier tie winner. */
export function approximateWallCurveParameter(curve: RoofCurve, point: readonly number[]): number {
  const { index, t } = closestWallCurveCoordinate(curve, point);
  return lerp(curve.knots[index], curve.knots[index + 1], t);
}

/** Original WallSpaceCoord::from_world_space 0x102000c30. The nearest planar
 * curve coordinate is clamped before multiplication by the published length. */
export function wallArclengthFromWorld(curve: RoofCurve, wallSpaceLength: number, point: readonly number[]): number {
  const length = f32(wallSpaceLength);
  if (!Number.isFinite(length) || length <= 0) throw Error("Positive finite wall-space length required");
  return mul(length, Math.min(1, Math.max(0, approximateWallCurveParameter(curve, point))));
}

/** Segment and factor before conversion back to normalized arclength. Height
 * interpolation uses these directly; tangent consumers intentionally re-resolve u. */
export function closestWallCurveCoordinate(curve: RoofCurve, point: readonly number[]): { index: number; t: number } {
  if (point.length !== 2 || !point.every((v) => Number.isFinite(f32(v))) || curve.points.some((p) => p.length !== 2))
    throw Error("Planar curve and finite XZ point required");
  let best = 3.4028234663852886e38,
    bestSegment = 0,
    bestT = 0;
  for (let i = 0; i < curve.points.length - 1; i++) {
    const a = curve.points[i],
      b = curve.points[i + 1];
    const dx = sub(b[0], a[0]),
      dz = sub(b[1], a[1]);
    const vx = sub(point[0], a[0]),
      vz = sub(point[1], a[1]);
    const t = Math.max(
      0,
      Math.min(1, div(add(mul(vx, dx), mul(vz, dz)), Math.max(add(mul(dx, dx), mul(dz, dz)), f32(1e-8))))
    );
    const px = add(mul(b[0], t), mul(a[0], sub(1, t))),
      pz = add(mul(b[1], t), mul(a[1], sub(1, t)));
    const ex = sub(point[0], px),
      ez = sub(point[1], pz);
    const distance = sqrt(add(mul(ex, ex), mul(ez, ez)));
    if (distance < best) {
      best = distance;
      bestSegment = i;
      bestT = t;
    }
  }
  return { index: bestSegment, t: bestT };
}
