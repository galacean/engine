import { add, sub, mul, div, sqrt, f32, sincos } from "./RecoveredRoofMath";
import { woodArchFramePoints, woodArchFrameParamsFromPoints, type WoodArchFrameParams } from "./RecoveredWoodArchFrame";

type Point = [number, number, number];
export interface WoodArchCornerParams {
  minimumSpan: number;
  maximumSpan: number;
  centerGap: number;
  heightRatio: number;
  curvature: number;
  endInset: number;
  verticalOffset: number;
  profileWidth: number;
  profileDepth: number;
  bevelSize: number;
}

/** Original WoodenArchCornerpieceDebugParams::default, 0x1010306a4.
 * Values are recovered parameters, not new authoring restrictions. */
export const DEFAULT_WOOD_ARCH_CORNERS: Readonly<WoodArchCornerParams> = Object.freeze({
  minimumSpan: 0.7,
  maximumSpan: 2,
  centerGap: 0.44,
  heightRatio: 0.9,
  curvature: 0.9,
  endInset: 0.1,
  verticalOffset: -0.1,
  profileWidth: 0.2025,
  profileDepth: 0.408,
  bevelSize: 0.05
});

function distance(a: Point, b: Point): number {
  const x = sub(b[0], a[0]),
    z = sub(b[2], a[2]);
  return sqrt(add(mul(x, x), mul(z, z)));
}

/** Original cornerpiece producer 0x1010314c4 and 0x10108549c.
 * Both supports use the shorter endpoint chord and sample their ceiling by XZ
 * arc length (CurveSlice callback 0x1010b8b44), not by 3D length or sample index.
 * Original libm sincos is approximated by browser Math in this CPU port. */
export function createWoodArchCornerParams(
  profile: { points: readonly (readonly [number, number, number])[]; heights: readonly number[] },
  narrow: boolean,
  parameters: Readonly<WoodArchCornerParams> = DEFAULT_WOOD_ARCH_CORNERS
): WoodArchFrameParams[] {
  const values = [
    parameters.minimumSpan,
    parameters.maximumSpan,
    parameters.centerGap,
    parameters.heightRatio,
    parameters.curvature,
    parameters.endInset,
    parameters.verticalOffset,
    parameters.profileWidth,
    parameters.profileDepth,
    parameters.bevelSize
  ].map(f32);
  if (
    profile.points.length !== profile.heights.length ||
    profile.points.some((p) => p.length !== 3 || !p.every((v) => Number.isFinite(f32(v)))) ||
    !profile.heights.every((v) => Number.isFinite(f32(v))) ||
    !values.every(Number.isFinite) ||
    typeof narrow !== "boolean"
  )
    throw Error("Invalid wood arch corner boundary");
  if (profile.points.length < 2) return [];
  const points: Point[] = profile.points.map((p, i) => [f32(p[0]), add(p[1], profile.heights[i]), f32(p[2])]);
  if (points.some((p) => !p.every(Number.isFinite))) throw Error("Invalid wood arch corner extent");
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = distance(points[i - 1], points[i]);
    lengths.push(segment);
    total = add(total, segment);
  }
  if (!Number.isFinite(total)) throw Error("Invalid wood arch corner extent");
  const minimum = Math.max(f32(0.01), values[0]),
    maximum = Math.max(minimum, values[1]);
  if (total < minimum) return [];
  const clamp = (s: number) => Math.min(total, Math.max(0, s));
  // CurveSlice advances using the remaining length; avoid normalized whole-curve U.
  const sample = (s: number): Point => {
    let remaining = f32(s);
    for (let i = 0; i < lengths.length; i++) {
      const rest = sub(lengths[i], remaining);
      // The native slice retains a zero-length edge at an exact endpoint.
      // Its undefined interpolation makes the chord invalid, so the producer
      // emits no braces; skipping it would invent supports absent in the source.
      if (rest >= 0) {
        const t = sub(1, div(rest, lengths[i]));
        return points[i].map((v, j) => add(v, mul(sub(points[i + 1][j], v), t))) as Point;
      }
      remaining = sub(remaining, lengths[i]);
    }
    return [...points[points.length - 1]];
  };
  const span = Math.min(maximum, Math.max(minimum, mul(Math.max(0, sub(total, Math.max(0, values[2]))), 0.5)));
  const starts = [clamp(values[5]), clamp(sub(total, values[5]))];
  const stops = [clamp(add(starts[0], span)), clamp(sub(starts[1], span))];
  const anchors = starts.map((s) => {
    const p = sample(s);
    p[1] = add(p[1], values[6]);
    return p;
  });
  const targets = stops.map(sample);
  const spans = targets.map((p, i) => distance(anchors[i], p));
  const commonSpan = Math.min(spans[0], spans[1]);
  if (!(commonSpan > f32(0.01))) return [];
  const frames: WoodArchFrameParams[] = [];
  for (let side = 0; side < 2; side++) {
    const a = anchors[side],
      target = targets[side],
      reciprocal = div(1, spans[side]);
    const direction: Point = [mul(sub(target[0], a[0]), reciprocal), 0, mul(sub(target[2], a[2]), reciprocal)];
    const b: Point = a.map((v, j) => add(v, mul(direction[j], commonSpan))) as Point;
    const sampleCeiling = (p: Point): number => {
      const projected = add(mul(sub(p[0], a[0]), direction[0]), mul(sub(p[2], a[2]), direction[2]));
      const s = clamp(add(starts[side], mul(side === 0 ? 1 : -1, projected)));
      return sub(sample(s)[1], 0.15);
    };
    if (sub(sampleCeiling(b), b[1]) > f32(0.8)) continue;
    const width = Math.max(f32(0.01), distance(a, b));
    const frameReciprocal = div(1, distance(a, b));
    const frameDirection: Point = [mul(sub(b[0], a[0]), frameReciprocal), 0, mul(sub(b[2], a[2]), frameReciprocal)];
    const height = Math.max(f32(0.01), mul(width, values[3]));
    const curve: Point[] = [];
    for (let i = 0; i < 7; i++) {
      const t = div(i, 6),
        inverse = sub(1, t),
        [sin, cos] = sincos(mul(t, f32(Math.PI / 2)));
      const radial = mul(width, cos),
        vertical = mul(height, sin),
        blend = values[4],
        straight = sub(1, blend);
      const p: Point = [0, 0, 0];
      for (let j = 0; j < 3; j++) {
        const lift = j === 1 ? height : mul(height, 0);
        const line = add(mul(b[j], t), mul(sub(a[j], lift), inverse));
        const arc = add(mul(vertical, j === 1 ? 1 : 0), sub(sub(b[j], lift), mul(frameDirection[j], radial)));
        p[j] = add(mul(straight, line), mul(blend, arc));
      }
      const ceiling = sampleCeiling(p);
      p[1] = Math.min(add(p[1], mul(t, sub(ceiling, p[1]))), ceiling);
      curve.push(p);
    }
    const frame = woodArchFrameParamsFromPoints(woodArchFramePoints(curve), 3, narrow, [
      Math.max(f32(0.01), values[7]),
      values[8],
      Math.max(0, values[9])
    ]);
    if (frame) frames.push(frame);
  }
  return frames;
}
