/** Original kernels: split_into_random_rows 0x10107db8c, trim_rows 0x1010ee614.
 * Explicit f32 and original random stream ordering. Neither kernel calls native code.
 */
import { f32, add, sub, mul, div, lerp, RoofRandom, randomSplits } from "./RecoveredRoofMath";
import type { WallCurve, WallRow, WallRect } from "./WallTypes";
export function wallHeightBoundaries(anchors: number[], height: number, seed: bigint, heightScale = 1): number[] {
  if (!(height > 0) || anchors.length < 2 || anchors.some((x) => !Number.isFinite(x)))
    throw Error("Invalid wall height anchors");
  const rng = new RoofRandom(seed),
    out: number[] = [];
  for (let i = 1; i < anchors.length; i++) {
    const a = f32(anchors[i - 1]),
      b = f32(anchors[i]),
      length = sub(b, a);
    if (!(length > 0)) throw Error("Wall anchor intervals must increase");
    const n = Math.max(Math.floor(div(length, mul(0.46, heightScale))), 2) + 1;
    let last = -100;
    for (const t of randomSplits(n, div(mul(0.21, heightScale), length), rng)) {
      const y = lerp(div(a, height), div(b, height), t);
      if (last > 0 && Math.abs(sub(last, y)) < div(mul(0.046, heightScale), height)) continue;
      out.push(y);
      last = y;
    }
  }
  return out;
}
const clamp = (x: number) => Math.min(1, Math.max(0, x));
export function trimWallRows(
  boundaries: number[],
  height: number,
  curve: WallCurve,
  top: number[],
  roof: boolean,
  widthScale = 1
): WallRow[] {
  const rows: WallRow[] = [],
    thresholdHeight = Math.max(f32(height), f32(0.1));
  for (let i = 1; i < boundaries.length; i++) {
    const y0 = boundaries[i - 1],
      y1 = boundaries[i],
      threshold = mul(mul(thresholdHeight, add(y0, y1)), 0.5);
    let start: number | null = top[0] > threshold ? curve.knots[0] : null;
    for (let j = 1; j < top.length; j++) {
      const a = top[j - 1],
        b = top[j];
      if (a <= threshold && b > threshold)
        start = lerp(curve.knots[j - 1], curve.knots[j], div(sub(threshold, a), sub(b, a)));
      else if (a > threshold && b <= threshold) {
        const end = lerp(curve.knots[j - 1], curve.knots[j], div(sub(threshold, a), sub(b, a)));
        if (start !== null) rows.push({ y0, y1, u0: start, u1: end, aboveStart: 0, aboveEnd: 0 });
        start = null;
      }
    }
    if (start !== null) rows.push({ y0, y1, u0: start, u1: curve.knots.at(-1)!, aboveStart: 0, aboveEnd: 0 });
  }
  const nominal = div(mul(0.46, widthScale), curve.length),
    step = mul(nominal, roof ? 0.2 : 0.7);
  // Native frinta (0x1010ee96c / 0x1010ee998): nearest, ties away from zero.
  for (const r of rows) {
    if (r.u0 !== 0) r.u0 = clamp(mul(step, Math.floor(div(r.u0, step) + 0.5)));
    if (r.u1 !== 1) r.u1 = clamp(mul(step, Math.floor(mul(div(1, step), r.u1) + 0.5)));
  }
  const kept = roof
    ? rows
    : curve.length > mul(0.92, widthScale)
      ? rows.filter((r) => sub(r.u1, r.u0) > nominal)
      : rows;
  if (roof)
    for (const r of kept)
      if (sub(r.u1, r.u0) <= nominal) {
        r.u0 = clamp(sub(mul(add(r.u1, r.u0), 0.5), mul(nominal, 0.5)));
        r.u1 = clamp(add(mul(nominal, 0.5), mul(add(r.u1, r.u0), 0.5)));
      }
  for (let i = 0; i < kept.length; i++) {
    const r = kept[i];
    for (let j = i + 1; j < kept.length; j++) {
      const s = kept[j];
      if (r.y1 === s.y0 && r.u0 <= s.u1 && s.u0 <= r.u1) {
        if (r.aboveStart === r.aboveEnd) r.aboveStart = j;
        r.aboveEnd = j + 1;
      }
    }
  }
  return kept;
}
export function wallSpanBoundaries(
  seed: bigint,
  count: number,
  row: number,
  length: number,
  special: boolean,
  cuts = [0, 1],
  widthScale = 1
): number[] {
  const rng = new RoofRandom(BigInt.asUintN(64, seed * 87263n + BigInt(count) * 345n + BigInt(row) * 9872349n));
  const out: number[] = [];
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1],
      b = cuts[i];
    if (b <= a) continue;
    const size = mul(length, sub(b, a));
    let n = Math.ceil(div(size, mul(special ? 0.69 : 0.46, widthScale)));
    if (special) n += n & 1;
    for (const t of randomSplits(Math.max(n + 1, 2), div(mul(special ? 0.05 : 0.32, widthScale), size), rng))
      out.push(lerp(a, b, t));
  }
  return out;
}
export function perturbWallEnds(
  bounds: WallRect,
  index: number,
  boundaries: number[],
  intervalCount: number,
  offset: number,
  cap: number
): void {
  const center = mul(add(bounds[0], bounds[2]), 0.5);
  if (index === 0)
    bounds[0] = add(
      bounds[0],
      mul(
        offset,
        Math.min(
          cap,
          mul(1.99, Math.min(center, add(mul(add(boundaries[intervalCount], boundaries[intervalCount - 1]), -0.5), 1)))
        )
      )
    );
  else if (index === intervalCount - 1)
    bounds[2] = add(
      bounds[2],
      mul(offset, Math.min(cap, mul(1.99, Math.min(sub(1, center), mul(add(boundaries[0], boundaries[1]), 0.5)))))
    );
}
