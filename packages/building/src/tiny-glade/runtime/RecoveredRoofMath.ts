/** Recovered scalar operations. Source build:
 * 4b3c843710a5f17fdb460d3f7add420f14ec2a2718fb7ebd677c3c8ba0ac589a.
 * Transcendentals use browser Math, not the original platform libm. Differential
 * verification is required before replacing a production producer.
 */
export const f32 = Math.fround;
export const add = (a: number, b: number) => f32(f32(a) + f32(b));
export const sub = (a: number, b: number) => f32(f32(a) - f32(b));
export const mul = (a: number, b: number) => f32(f32(a) * f32(b));
export const div = (a: number, b: number) => f32(f32(a) / f32(b));
export const sqrt = (a: number) => f32(Math.sqrt(f32(a)));
export const lerp = (a: number, b: number, t: number) => add(mul(sub(1, t), a), mul(t, b));
export const dot = (a: number[], b: number[]) => {
  const p = a.map((v, i) => mul(v, b[i]));
  return p.length === 3 ? add(p[2], add(p[0], p[1])) : add(p[0], p[1]);
};
export const cross = (a: number[], b: number[]) => [
  sub(mul(a[1], b[2]), mul(a[2], b[1])),
  sub(mul(a[2], b[0]), mul(a[0], b[2])),
  sub(mul(a[0], b[1]), mul(a[1], b[0]))
];
export const sincos = (x: number) => [f32(Math.sin(f32(x))), f32(Math.cos(f32(x)))];

/** 0x102032a10: keep all 64 seed bits, including through JSON boundaries. */
export class RoofRandom {
  private state: bigint;
  constructor(seed: bigint) {
    if (typeof seed !== "bigint" || seed < 0n || seed >= 1n << 64n) throw Error("uint64 seed required");
    this.state = seed;
  }
  next(): number {
    this.state = BigInt.asUintN(64, this.state + 0xa0761d6478bd642fn);
    const p = this.state * (this.state ^ 0xe7037ed1a0b428dbn);
    return Number(((p ^ (p >> 64n)) & 0xffffffffn) >> 9n) / 2 ** 23;
  }
}

/** 0x101ffc97c: zero jitter still consumes n - 2 random numbers. */
export function randomSplits(n: number, jitter: number, rng: RoofRandom): number[] {
  if (!Number.isSafeInteger(n) || n < 2) throw Error("At least two boundaries required");
  const step = div(1, f32(n - 1)),
    amp = Math.min(f32(jitter), mul(step, 0.495));
  return [0, ...Array.from({ length: n - 2 }, (_, i) => add(mul(i + 1, step), mul(sub(rng.next(), 0.5), amp))), 1];
}

export class RoofCurve {
  readonly points: number[][];
  readonly knots: number[];
  readonly length: number;
  constructor(points: number[][]) {
    if (points.length < 2) throw Error("At least two curve points required");
    this.points = points.map((p) => p.map(f32));
    let total = 0,
      last = this.points[0];
    const lengths = this.points.map((p) => {
      const d = last.map((x, i) => sub(x, p[i]));
      total = add(total, sqrt(dot(d, d)));
      last = p;
      return total;
    });
    if (!(total > 0) || !Number.isFinite(total)) throw Error("Degenerate curve");
    this.length = total;
    this.knots = lengths.map((x) => div(x, total));
  }
  coord(u: number): [number, number] {
    u = f32(u);
    if (u <= 0) return [0, 0];
    if (u >= 1) return [this.points.length - 2, 1];
    let lo = 0,
      hi = this.knots.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.knots[mid] <= u) lo = mid + 1;
      else hi = mid;
    }
    const i = lo - 1;
    return [i, Math.min(1, Math.max(0, div(sub(u, this.knots[i]), sub(this.knots[i + 1], this.knots[i]))))];
  }
  sample(u: number): number[] {
    const [i, t] = this.coord(u);
    return this.points[i].map((v, j) => lerp(v, this.points[i + 1][j], t));
  }
  tangent(u: number): number[] {
    const [i] = this.coord(u),
      d = this.points[i].map((v, j) => sub(this.points[i + 1][j], v)),
      r = div(1, sqrt(dot(d, d)));
    return d.map((x) => mul(x, r));
  }
}

export interface RoofSurface {
  type: "native_circular_roof_profile" | "native_rectangular_roof_profile";
  tip_offset: number[];
  profile: number;
  height_parameter: number;
  ridge_parameter: number;
  eave_parameter: number;
  axis: number;
  edge_mode: number;
  base_height: number;
  /** Host construction joint: reserved facade thickness, not an author/native field. */
  wall_outset?: number;
}
export interface CircularFootprint {
  center: number[];
  radius: number;
  phase: number;
}
export interface RectangularFootprint {
  center: number[];
  orientation: number[];
  width: number;
  depth: number;
}
export interface UnitMetrics {
  width: number;
  height: number;
  depth: number;
}
export type RoofFootprint = CircularFootprint | RectangularFootprint;
export const isCircle = (f: RoofFootprint): f is CircularFootprint => "radius" in f;

export function normalizedProfile(profile: number): RoofCurve {
  const e = add(mul(profile, 1.5), mul(sub(1, profile), 0.5));
  return new RoofCurve(
    Array.from({ length: 20 }, (_, i) => [f32(i / 19), i === 19 ? 1 : f32(Math.pow(f32(i / 19), e))])
  );
}
export function flare(s: RoofSurface): number {
  const q = f32(s.profile),
    e = f32(s.eave_parameter);
  return mul(add(mul(e, 1.5), mul(sub(1, e), 0)), add(sqrt(q), mul(sub(1, sqrt(q)), 0.5)));
}
export function expandedDimensions(s: RoofSurface, f: CircularFootprint): [number, number];
export function expandedDimensions(s: RoofSurface, f: RectangularFootprint): [number[], number[]];
export function expandedDimensions(s: RoofSurface, f: RoofFootprint): [number, number] | [number[], number[]] {
  const e = flare(s);
  if (isCircle(f)) return [add(f.radius, mul(add(mul(e, 1.2), 0.28), 0.5)), f32(0.2)];
  const w = f32(f.width),
    d = f32(f.depth),
    ridge = f32(s.ridge_parameter);
  const top = add(mul(sub(1, ridge), 0.1), mul(ridge, s.axis ? d : w));
  const lower = [add(add(w, 0.28), e), add(add(d, 0.28), e)];
  const upper = s.axis ? [f32(0.1), top] : [top, f32(0.1)];
  if (s.wall_outset !== undefined && ridge === 1) {
    // A host wall and its roof meet at the reserved finish envelope. Native
    // callers omit this and retain the original raised-masonry gable recipe.
    lower[0] = add(add(w, mul(2, s.wall_outset)), e);
    lower[1] = add(add(d, mul(2, s.wall_outset)), e);
    upper[s.axis] = lower[s.axis];
  }
  return [lower, upper];
}
export function roofHeight(s: RoofSurface, f: RoofFootprint): number {
  const h = f32(s.height_parameter);
  if (h <= f32(0.1)) return 0;
  let t = isCircle(f)
    ? div(sub(f.radius, f32(0.90000004)), 7.1)
    : div(sub(Math.max(f32(f.width), f32(f.depth)), 2.25), 12.75);
  t = Math.min(1, Math.max(0, div(t, 0.4)));
  t = mul(mul(t, t), sub(3, add(t, t)));
  const cap = add(mul(t, 12), mul(isCircle(f) ? 8 : 9, sub(1, t)));
  return Math.min(cap, Math.max(0, add(mul(h, 12), mul(sub(1, h), 0.4))));
}
export function worldProfile(s: RoofSurface, f: RoofFootprint, bottom: number, top: number): RoofCurve {
  const h = roofHeight(s, f);
  return new RoofCurve(normalizedProfile(s.profile).points.map(([x, y]) => [lerp(bottom, top, x), mul(y, h)]));
}

export function quaternionAxes(x: number[], y: number[], z: number[]): number[] {
  const [m00, m10, m20] = x,
    [m01, m11, m21] = y,
    [m02, m12, m22] = z;
  let t: number, v: number[];
  if (m22 <= 0) {
    const dif = sub(m11, m00),
      om = sub(1, m22);
    if (dif <= 0) {
      t = sub(om, dif);
      v = [t, add(m01, m10), add(m02, m20), sub(m21, m12)];
    } else {
      t = add(om, dif);
      v = [add(m01, m10), t, add(m12, m21), sub(m02, m20)];
    }
  } else {
    const plus = add(m00, m11),
      op = add(m22, 1);
    if (plus <= 0) {
      t = sub(op, plus);
      v = [add(m02, m20), add(m12, m21), t, sub(m10, m01)];
    } else {
      t = add(plus, op);
      v = [sub(m21, m12), sub(m02, m20), sub(m10, m01), t];
    }
  }
  const r = div(0.5, sqrt(t));
  return v.map((c) => mul(c, r));
}
export function rotation(v: number[], axis: number[], angle: number): number[] {
  const [s, c] = sincos(mul(angle, 0.5)),
    q = axis.map((x) => mul(x, s));
  const t = sub(mul(c, c), dot(q, q)),
    d = mul(dot(v, q), 2),
    cr = cross(q, v),
    c2 = add(c, c);
  return v.map((x, i) => add(mul(cr[i], c2), add(mul(x, t), mul(q[i], d))));
}
