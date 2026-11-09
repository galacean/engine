import { add, sub, mul, div, sqrt, f32 } from "./RecoveredRoofMath";

/** Native 24-byte path sample: position followed by the supplied frame normal. */
export type WoodArchFramePoint = readonly [number, number, number, number, number, number];

function validatePoints(points: readonly WoodArchFramePoint[]): void {
  if (points.some((p) => p.length !== 6 || !p.every((v) => Number.isFinite(f32(v)))))
    throw Error("Invalid wood arch frame points");
}

function delta(a: WoodArchFramePoint, b: WoodArchFramePoint): number[] {
  return [sub(a[0], b[0]), sub(a[1], b[1]), sub(a[2], b[2])];
}

function length(v: number[]): number {
  return sqrt(add(add(mul(v[0], v[0]), mul(v[1], v[1])), mul(v[2], v[2])));
}

function normalize(v: number[], normalOrder = false): number[] {
  const squared = normalOrder
    ? add(add(mul(v[2], v[2]), mul(v[0], v[0])), mul(v[1], v[1]))
    : add(add(mul(v[0], v[0]), mul(v[1], v[1])), mul(v[2], v[2]));
  const reciprocal = div(1, sqrt(squared));
  return Number.isFinite(reciprocal) && reciprocal > 0 ? v.map((x) => mul(x, reciprocal)) : [0, 0, 0];
}

/** Catmull-Rom midpoint, preserving the producer's float32 operation order. */
function midpoint(a: number, b: number, c: number, d: number): number {
  const cubic = mul(add(d, sub(sub(mul(b, 3), a), mul(c, 3))), 0.125);
  const linear = mul(sub(c, a), 0.5);
  const quadratic = mul(sub(add(mul(c, 4), add(add(a, a), mul(b, -5))), d), 0.25);
  return mul(add(cubic, add(add(add(b, b), linear), quadratic)), 0.5);
}

/** Native wooden_arch_frame_dense_points, 0x1010306c8.
 * Adds one Catmull-Rom midpoint where neighboring tangents have dot < .94.
 * Supplied normals are interpolated and normalized at inserted points.
 * Input ownership stays with the caller; every output sample is a new tuple. */
export function woodArchFrameDensePoints(points: readonly WoodArchFramePoint[]): WoodArchFramePoint[] {
  validatePoints(points);
  if (!points.length) throw Error("Empty wood arch frame path");
  const source = points.map((p) => p.map(f32) as unknown as WoodArchFramePoint);
  const output: WoodArchFramePoint[] = [];
  for (let i = 0; i + 1 < source.length; i++) {
    const b = source[i],
      c = source[i + 1];
    const a = source[Math.max(0, i - 1)],
      d = source[Math.min(source.length - 1, i + 2)];
    output.push(b);
    const incoming = normalize(i === 0 ? delta(c, b) : delta(b, a));
    const outgoing = normalize(i + 2 < source.length ? delta(d, c) : delta(c, b));
    const dot = add(mul(incoming[2], outgoing[2]), add(mul(incoming[0], outgoing[0]), mul(incoming[1], outgoing[1])));
    if (dot < f32(0.94)) {
      const n = normalize(
        [3, 4, 5].map((j) => add(mul(b[j], 0.5), mul(c[j], 0.5))),
        true
      );
      output.push([
        midpoint(a[0], b[0], c[0], d[0]),
        midpoint(a[1], b[1], c[1], d[1]),
        midpoint(a[2], b[2], c[2], d[2]),
        n[0],
        n[1],
        n[2]
      ]);
    }
  }
  output.push(source[source.length - 1]);
  if (output.some((p) => !p.every(Number.isFinite))) throw Error("Invalid wood arch frame extent");
  return output;
}

export interface WoodArchFrameParams {
  /** 48-byte records: position/distance, tangent/pad, normal/pad. */
  records: Float32Array;
  centerRadius: [number, number, number, number];
  ends: number;
  section: [number, number, number];
}

/** Shared publication boundary for CPU structure and GPU records. */
export function validateWoodArchFrame(frame: WoodArchFrameParams): void {
  if (
    !(frame.records instanceof Float32Array) ||
    frame.records.length < 24 ||
    frame.records.length % 12 ||
    !frame.records.every(Number.isFinite) ||
    frame.centerRadius.length !== 4 ||
    !frame.centerRadius.every((v) => Number.isFinite(f32(v))) ||
    frame.centerRadius[3] <= 0 ||
    frame.section.length !== 3 ||
    !frame.section.every((v) => Number.isFinite(f32(v))) ||
    f32(frame.section[0]) <= 0 ||
    f32(frame.section[1]) <= 0 ||
    frame.section[2] < 0 ||
    !Number.isInteger(frame.ends) ||
    frame.ends < 0 ||
    frame.ends > 15
  )
    throw Error("Invalid wood arch render frame");
  for (let offset = 0; offset < frame.records.length; offset += 12) {
    if (frame.records[offset + 3] < 0 || (offset > 0 && frame.records[offset + 3] < frame.records[offset - 9]))
      throw Error("Wood arch sample distances must be nondecreasing");
    const t = frame.records.subarray(offset + 4, offset + 7),
      n = frame.records.subarray(offset + 8, offset + 11);
    const basis = [
      sub(mul(n[1], t[2]), mul(n[2], t[1])),
      sub(mul(n[2], t[0]), mul(n[0], t[2])),
      sub(mul(n[0], t[1]), mul(n[1], t[0]))
    ];
    if (!basis.some((v) => v !== 0) || !basis.every(Number.isFinite))
      throw RangeError("Degenerate wood arch structural basis");
  }
}

/** Native wooden_arch_frame_params_from_points, 0x10103102c.
 * The caller owns corner splitting and point densification. The three section
 * parameters and end flags remain native values until their mesh consumer.
 * This packs the curve; it does not invent a replacement mesh or render it. */
export function woodArchFrameParamsFromPoints(
  points: readonly WoodArchFramePoint[],
  ends: number,
  narrow: boolean,
  section: readonly [number, number, number]
): WoodArchFrameParams | null {
  validatePoints(points);
  if (
    !Number.isInteger(ends) ||
    ends < 0 ||
    ends > 3 ||
    typeof narrow !== "boolean" ||
    section.length !== 3 ||
    !section.every((v) => Number.isFinite(f32(v)))
  )
    throw Error("Invalid wood arch frame parameters");
  if (points.length < 2) return null;
  const records = new Float32Array(points.length * 12);
  const center = [0, 0, 0];
  let distance = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      prev = points[Math.max(0, i - 1)],
      next = points[Math.min(points.length - 1, i + 1)];
    const tangent = normalize(delta(next, prev));
    if (i > 0) distance = add(distance, length(delta(prev, p)));
    const offset = i * 12;
    for (let j = 0; j < 3; j++) {
      records[offset + j] = p[j];
      records[offset + 4 + j] = tangent[j];
      records[offset + 8 + j] = p[3 + j];
      center[j] = add(center[j], p[j]);
    }
    records[offset + 3] = distance;
  }
  for (let j = 0; j < 3; j++) center[j] = div(center[j], points.length);
  let radius = 0;
  for (const p of points)
    radius = Math.max(radius, length([sub(p[0], center[0]), sub(p[1], center[1]), sub(p[2], center[2])]));
  const centerRadius: WoodArchFrameParams["centerRadius"] = [center[0], center[1], center[2], add(radius, 1)];
  if (!records.every(Number.isFinite) || !centerRadius.every(Number.isFinite))
    throw Error("Invalid wood arch frame extent");
  return {
    records,
    centerRadius,
    ends,
    section: [f32(section[0]), mul(section[1], narrow ? 0.6 : 1), f32(section[2])]
  };
}

function horizontalDirection(a: readonly number[], b: readonly number[]): [number, number] {
  const x = sub(b[0], a[0]),
    z = sub(b[2], a[2]);
  const reciprocal = div(1, sqrt(add(mul(x, x), mul(z, z))));
  return Number.isFinite(reciprocal) && reciprocal > 0 ? [mul(x, reciprocal), mul(z, reciprocal)] : [0, 0];
}

/** Original point-to-normal fold 0x1010d913c. Each independently split path owns
 * its endpoint tangents; the normal lies in XZ even on a sloping lintel. */
export function woodArchFramePoints(positions: readonly (readonly number[])[]): WoodArchFramePoint[] {
  if (positions.some((p) => p.length !== 3 || !p.every((v) => Number.isFinite(f32(v)))))
    throw Error("Invalid wood arch frame positions");
  if (positions.length < 2) return [];
  return positions.map((p, i) => {
    const direction = horizontalDirection(
      positions[Math.max(0, i - 1)],
      positions[Math.min(positions.length - 1, i + 1)]
    );
    return [f32(p[0]), f32(p[1]), f32(p[2]), -direction[1], 0, direction[0]];
  });
}

/** Whole native create_wooden_arch_frame_params (0x101030ccc).
 * Takes the SAME resolved boundary heights used to cut the host. Sharp plan-view
 * turns split the frame and set internal-end flags before local normals and
 * Catmull-Rom densification are computed. Corner braces are a separate producer.
 */
export function createWoodArchFrameParams(
  profile: { points: readonly (readonly [number, number, number])[]; heights: readonly number[] },
  narrow: boolean
): WoodArchFrameParams[] {
  if (
    profile.points.length !== profile.heights.length ||
    profile.points.some((p) => p.length !== 3 || !p.every((v) => Number.isFinite(f32(v)))) ||
    !profile.heights.every((v) => Number.isFinite(f32(v))) ||
    typeof narrow !== "boolean"
  )
    throw Error("Invalid wood arch frame boundary");
  if (profile.points.length < 2) return [];
  const positions = profile.points.map((p, i) => [f32(p[0]), add(p[1], profile.heights[i]), f32(p[2])]);
  if (positions.some((p) => !p.every(Number.isFinite))) throw Error("Invalid wood arch frame extent");
  const breaks = [0],
    frames: WoodArchFrameParams[] = [];
  for (let i = 1; i + 1 < positions.length; i++) {
    const incoming = horizontalDirection(positions[i - 1], positions[i]);
    const outgoing = horizontalDirection(positions[i], positions[i + 1]);
    const length0 = add(mul(incoming[0], incoming[0]), mul(incoming[1], incoming[1]));
    const length1 = add(mul(outgoing[0], outgoing[0]), mul(outgoing[1], outgoing[1]));
    const dot = add(mul(incoming[0], outgoing[0]), mul(incoming[1], outgoing[1]));
    if (length0 > f32(0.01) && length1 > f32(0.01) && dot < f32(0.017452383)) breaks.push(i);
  }
  breaks.push(positions.length - 1);
  for (let b = 1; b < breaks.length; b++) {
    const start = breaks[b - 1],
      end = breaks[b];
    const points = woodArchFramePoints(positions.slice(start, end + 1));
    const ends = (start > 0 ? 1 : 0) | (end + 1 < positions.length ? 2 : 0);
    const frame = woodArchFrameParamsFromPoints(woodArchFrameDensePoints(points), ends, narrow, [0.36, 0.646, 0.16]);
    if (frame) frames.push(frame);
  }
  return frames;
}
