import { Vector3 } from "@galacean/engine-math";

export interface RiverCurvePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export const RIVER_CATMULL_ROM_ALPHA = 0.5;
const POSITION_EPSILON = 0.0001;

/** Preserve each caller's floating-point operation order as well as its cubic curve. */
export function evaluateRiverCubicBezier(
  a: RiverCurvePoint,
  b: RiverCurvePoint,
  c: RiverCurvePoint,
  d: RiverCurvePoint,
  t: number,
  arithmetic: "coordinates-first" | "weights-first" = "coordinates-first"
): Vector3 {
  const inverse = 1 - t;
  const inverse2 = inverse * inverse;
  const t2 = t * t;
  const coordinate = (a: number, b: number, c: number, d: number): number =>
    arithmetic === "weights-first"
      ? inverse ** 3 * a + 3 * inverse * inverse * t * b + 3 * inverse * t * t * c + t ** 3 * d
      : a * inverse2 * inverse + b * 3 * inverse2 * t + c * 3 * inverse * t2 + d * t2 * t;
  return new Vector3(coordinate(a.x, b.x, c.x, d.x), coordinate(a.y, b.y, c.y, d.y), coordinate(a.z, b.z, c.z, d.z));
}

/** Centripetal Catmull-Rom; absent neighbors use the shared River endpoint extrapolation. */
export function evaluateRiverCatmullRom(
  previous: RiverCurvePoint | undefined,
  start: RiverCurvePoint,
  end: RiverCurvePoint,
  next: RiverCurvePoint | undefined,
  t: number
): Vector3 {
  if (t <= 0) return new Vector3(start.x, start.y, start.z);
  if (t >= 1) return new Vector3(end.x, end.y, end.z);
  const extrapolate = (a: RiverCurvePoint, b: RiverCurvePoint) =>
    new Vector3(a.x * 2 - b.x, a.y * 2 - b.y, a.z * 2 - b.z);
  const p0 = previous ?? extrapolate(start, end),
    p3 = next ?? extrapolate(end, start);
  const knot = (a: RiverCurvePoint, b: RiverCurvePoint, time: number) => {
    const dx = a.x - b.x,
      dy = a.y - b.y,
      dz = a.z - b.z;
    return time + Math.pow(Math.sqrt(dx * dx + dy * dy + dz * dz), RIVER_CATMULL_ROM_ALPHA);
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const interpolate = (a: RiverCurvePoint, b: RiverCurvePoint, from: number, to: number, time: number) => {
    const span = to - from;
    if (span <= POSITION_EPSILON) return new Vector3(a.x, a.y, a.z);
    const fraction = (time - from) / span;
    return new Vector3(lerp(a.x, b.x, fraction), lerp(a.y, b.y, fraction), lerp(a.z, b.z, fraction));
  };
  const t0 = 0,
    t1 = knot(p0, start, t0),
    t2 = knot(start, end, t1),
    t3 = knot(end, p3, t2);
  const time = lerp(t1, t2, t);
  const a1 = interpolate(p0, start, t0, t1, time),
    a2 = interpolate(start, end, t1, t2, time),
    a3 = interpolate(end, p3, t2, t3, time);
  const b1 = interpolate(a1, a2, t0, t2, time),
    b2 = interpolate(a2, a3, t1, t3, time);
  return interpolate(b1, b2, t1, t2, time);
}
