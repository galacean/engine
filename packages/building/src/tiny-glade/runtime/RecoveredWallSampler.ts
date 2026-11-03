import { add, sub, mul, div, sqrt, f32, type RoofCurve } from "./RecoveredRoofMath";
import { wallArclengthFromWorld } from "./RecoveredWallSpace";
import type { RecoveredBoardWallSpace } from "./RecoveredBoardWallSpace";

/** Original WallSampler entry: X, Z, wall arclength and two scalar channels.
 * Sampling retains both channels; their interpretation belongs to the producer. */
export type WallSample = readonly [number, number, number, number, number];
export interface WallSamplePair {
  a: WallSample;
  b: WallSample;
  t: number;
}

/** Original WallSampler::new 0x1010ef76c, including its map/zip producer
 * 0x1010d9a7c. Contour Y is the lower channel; published top Y is the upper.
 * The native zip stops at the shorter input. Closedness comes from the source
 * wall shape, independently of the board chart's optional regular shape. */
export function buildWoodWallSampler(
  sourceCurve: RoofCurve,
  contour: readonly (readonly [number, number, number])[],
  tops: readonly number[],
  chart: RecoveredBoardWallSpace,
  closed: boolean
): RecoveredWallSampler {
  const mapped: [number, number, number, number, number][] = [];
  const count = Math.min(contour.length, tops.length);
  for (let i = 0; i < count; i++) {
    const point = contour[i];
    if (point.length !== 3 || !point.every((n) => Number.isFinite(f32(n))) || !Number.isFinite(f32(tops[i])))
      throw Error("Finite contour XYZ and wall top required");
    const u = chart.remap(wallArclengthFromWorld(sourceCurve, chart.sourceLength, [point[0], point[2]]));
    const position = chart.boardShape
      ? chart.boardShape.point(div(u, chart.boardLength))
      : [f32(point[0]), f32(point[2])];
    mapped.push([position[0], position[1], u, f32(point[1]), f32(tops[i])]);
  }
  mapped.sort((a, b) =>
    a[2] === b[2]
      ? Object.is(a[2], -0) === Object.is(b[2], -0)
        ? 0
        : Object.is(a[2], -0)
          ? -1
          : 1
      : a[2] < b[2]
        ? -1
        : 1
  );
  const samples: [number, number, number, number, number][] = [];
  for (const row of mapped) {
    const previous = samples[samples.length - 1];
    if (previous && Math.abs(sub(previous[2], row[2])) <= f32(0.001)) {
      previous[3] = Math.min(previous[3], row[3]);
      previous[4] = Math.max(previous[4], row[4]);
    } else samples.push(row);
  }
  if (closed && samples.length) {
    const first = samples[0];
    samples.push([first[0], first[1], add(first[2], chart.boardLength), first[3], first[4]]);
  }
  return new RecoveredWallSampler(samples, chart.boardLength, closed);
}

/** Native 0x1010ef264. This samples published wall records, not normalized
 * RoofCurve knots: the small-interval denominator and closed seam differ. */
export class RecoveredWallSampler {
  readonly samples: readonly WallSample[];
  readonly length: number;

  constructor(
    samples: readonly WallSample[],
    length: number,
    readonly closed: boolean
  ) {
    this.length = f32(length);
    if (!Number.isFinite(this.length) || this.length < 0 || (closed && this.length === 0))
      throw Error("Finite nonnegative wall length required; closed walls require positive length");
    this.samples = Object.freeze(
      samples.map((sample, i) => {
        if (sample.length !== 5 || sample.some((n) => !Number.isFinite(f32(n))))
          throw Error("Five finite wall sample values required");
        if (i > 0 && f32(sample[2]) < f32(samples[i - 1][2])) throw Error("Wall samples must be ordered by arclength");
        return Object.freeze(sample.map(f32)) as unknown as WallSample;
      })
    );
  }

  project(distance: number): number {
    let x = f32(distance);
    if (!Number.isFinite(x)) throw Error("Finite wall arclength required");
    if (!this.closed) return Math.min(this.length, Math.max(0, x));
    x = f32(x % this.length);
    return x < 0 ? add(x, this.length) : x;
  }

  samplePairAt(distance: number): WallSamplePair | null {
    const points = this.samples;
    if (!points.length) return null;
    let x = this.project(distance);
    if (this.closed && x < points[0][2]) x = add(this.length, x);
    if (x <= points[0][2]) return { a: points[0], b: points[0], t: 0 };
    const last = points[points.length - 1];
    if (x >= last[2]) return { a: last, b: last, t: 0 };
    // Lower bound, not upper bound: an exact knot belongs to the prior pair.
    let lo = 0,
      hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[mid][2] < x) lo = mid + 1;
      else hi = mid;
    }
    const a = points[lo - 1],
      b = points[lo];
    const t = Math.max(0, Math.min(1, div(sub(x, a[2]), Math.max(sub(b[2], a[2]), f32(0.0001)))));
    return { a, b, t };
  }

  positionAt(distance: number): [number, number] {
    const pair = this.samplePairAt(distance);
    if (!pair) return [0, 0];
    const { a, b, t } = pair,
      oneMinusT = sub(1, t);
    return [add(mul(b[0], t), mul(a[0], oneMinusT)), add(mul(b[1], t), mul(a[1], oneMinusT))];
  }

  /** Native 0x1010ef4c4: retry a collapsed chord around its center before
   * falling back to +X. Closed-seam midpoint uses an unwrapped interval. */
  tangentBetween(from: number, to: number): [number, number, number] {
    const start = this.project(from);
    let end = this.project(to);
    if (this.closed && end < start) end = add(this.length, end);
    const chord = (a: number, b: number) => {
      const p = this.positionAt(a),
        q = this.positionAt(b);
      return [sub(q[0], p[0]), sub(q[1], p[1])];
    };
    let delta = chord(start, end);
    let square = add(mul(delta[0], delta[0]), mul(delta[1], delta[1]));
    if (square <= f32(0.0001)) {
      const center = mul(add(start, end), 0.5),
        step = Math.max(mul(this.length, 0.001), f32(0.01));
      delta = chord(sub(center, step), add(center, step));
      square = add(mul(delta[0], delta[0]), mul(delta[1], delta[1]));
      if (square <= f32(0.0001)) return [1, 0, 0];
    }
    const inverse = div(1, sqrt(square));
    return [mul(delta[0], inverse), 0, mul(delta[1], inverse)];
  }
}
