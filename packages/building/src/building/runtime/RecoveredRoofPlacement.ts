/** Initial roof arrangements, independent of materials and GPU animation.
 * Uses browser Math with the separately verified numerical migration tolerance.
 */
import { f32BitsToHalf } from "./UnitPacking.js";
import {
  f32,
  add,
  sub,
  mul,
  div,
  sqrt,
  dot,
  cross,
  sincos,
  RoofRandom,
  randomSplits,
  expandedDimensions,
  roofHeight,
  worldProfile,
  quaternionAxes,
  rotation
} from "./RecoveredRoofMath";
import type { RoofSurface, CircularFootprint, UnitMetrics } from "./RecoveredRoofMath";

export interface RowContext {
  side_index: number;
  row_index: number;
  column_index?: number;
  row_u: number;
  row_count?: number;
  column_count?: number;
  split_interval?: number[];
  split_count?: number;
}
export interface RoofEmission {
  role: string;
  callsite: string;
  initial64_hex: string;
  source_full_precision?: { quaternion: number[]; scale: number[]; tile_t: number[]; clip_plane: number[] };
  row_context?: RowContext;
  original_endpoints?: { a: number[]; b: number[] };
}
export function packRoof(
  position: number[],
  quat: number[],
  scale: number[],
  t: number,
  slot: number,
  ordinal: number,
  flag: number,
  circular = false,
  clip = [0, 1, 0, 65504]
): string {
  const bytes = new Uint8Array(64),
    view = new DataView(bytes.buffer);
  vector(position, 3);
  position.forEach((v, i) => view.setFloat32(i * 4, v, true));
  const scratch = new DataView(new ArrayBuffer(4));
  [...clip, ...scale, t, ...quat].forEach((v, i) => {
    if (!Number.isFinite(v)) throw Error("Non-finite roof instance");
    scratch.setFloat32(0, v, true);
    const half = f32BitsToHalf(scratch.getUint32(0, true));
    if ((half & 0x7c00) === 0x7c00) throw Error("Half-float roof instance overflow");
    view.setUint16(16 + i * 2, half, true);
  });
  view.setUint32(40, slot, true);
  view.setUint32(52, ordinal, true);
  view.setUint32(56, circular ? 1 : 0, true);
  view.setUint32(60, flag, true);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function vector(v: number[], n: number): void {
  if (!Array.isArray(v) || v.length !== n || v.some((x) => typeof x !== "number" || !Number.isFinite(f32(x))))
    throw Error("Finite vector required");
}
export function validateSurface(s: RoofSurface): void {
  const keys = [
    "type",
    "tip_offset",
    "profile",
    "height_parameter",
    "ridge_parameter",
    "eave_parameter",
    "axis",
    "edge_mode",
    "base_height"
  ];
  if (s?.wall_outset !== undefined) {
    if (!(s.wall_outset >= 0) || !Number.isFinite(s.wall_outset))
      throw Error("Finite nonnegative wall envelope required");
    keys.push("wall_outset");
  }
  if (!s || Object.keys(s).length !== keys.length || keys.some((k) => !(k in s)))
    throw Error("Explicit roof descriptor required");
  vector(s.tip_offset, 2);
  vector([s.profile, s.height_parameter, s.ridge_parameter, s.eave_parameter, s.base_height], 5);
  if (s.profile < 0 || ![0, 1].includes(s.axis) || ![0, 1].includes(s.edge_mode))
    throw Error("Invalid profile or flag");
}
export function validateMetrics(m: UnitMetrics, slot: number): UnitMetrics {
  if (!m || Object.keys(m).sort().join() !== "depth,height,width") throw Error("Explicit unit footprint required");
  vector([m.width, m.height, m.depth], 3);
  if (Math.min(f32(m.width), f32(m.height), f32(m.depth)) <= 0) throw Error("Positive unit footprint required");
  if (!Number.isInteger(slot) || slot < 0 || slot >= 2 ** 32) throw Error("uint32 slot required");
  return { width: f32(m.width), height: f32(m.height), depth: f32(m.depth) };
}
export function generateCircularRoof(
  s: RoofSurface,
  f: CircularFootprint,
  seed = 0n,
  metrics: UnitMetrics = { width: 0.5, height: 0.4375, depth: 0.1 },
  renderSlot = 0
) {
  validateSurface(s);
  metrics = validateMetrics(metrics, renderSlot);
  if (s.type !== "native_circular_roof_profile") throw Error("Circular profile required");
  if (!f || Object.keys(f).sort().join() !== "center,phase,radius") throw Error("Circular footprint required");
  vector(f.center, 2);
  vector([f.radius, f.phase], 2);
  if (!(f32(f.radius) > 0) || roofHeight(s, f) === 0) throw Error("Positive radius and pitched roof required");
  const [bottom, top] = expandedDimensions(s, f),
    c = worldProfile(s, f, bottom, top);
  const n = Math.max(2, Math.ceil(div(c.length, metrics.height))),
    length = mul(div(c.length, n), f32(1.4285715));
  const rng = new RoofRandom(seed),
    emits: RoofEmission[] = [],
    rows: object[] = [];
  let ordinal = 0;
  const tau = f32(Math.PI * 2);
  let phase = f32(f32(f.phase) % tau);
  if (phase < 0) phase = add(phase, tau);
  const tip = s.tip_offset.map((t) => mul(mul(t, mul(f.radius, 2)), 0.5));
  function local(u: number, radius: number) {
    const [si, co] = sincos(add(mul(sub(1, u), tau), phase));
    return [add(0, mul(radius, co)), add(0, mul(radius, si))];
  }
  function emit(
    role: string,
    pos: number[],
    quat: number[],
    scale: number[],
    t: number,
    row: RowContext
  ): RoofEmission {
    return {
      role,
      callsite: role === "ordinary_slope" ? "0x10055bcd0" : "0x10055bea0",
      initial64_hex: packRoof(
        pos,
        quat,
        scale,
        t,
        renderSlot,
        ordinal,
        role === "first_row_closure" || row.row_index === 0 ? 2 : 1,
        true
      ),
      source_full_precision: { quaternion: quat, scale, tile_t: [t], clip_plane: [0, 1, 0, 65504] },
      row_context: { ...row }
    };
  }
  for (let ri = 0; ri < n - 1; ri++) {
    const u = div(ri, n - 1),
      [radius, height] = c.sample(u),
      ctr = f.center.map((v, i) => add(v, mul(tip[i], u)));
    const taper = Math.min(1, Math.max(0, div(sub(radius, 0.9), sub(0.3, 0.9))));
    const factor = add(mul(taper, 0.5), sub(1, taper)),
      perimeter = mul(radius, tau),
      randRotation = rng.next();
    const cols = Math.max(5, Math.ceil(div(perimeter, mul(mul(factor, 0.5), div(metrics.width, 0.5)))));
    const [si, co] = sincos(mul(randRotation, tau)),
      splits = randomSplits(cols + 1, div(mul(factor, 0), perimeter), rng);
    const tangent = c.tangent(u),
      slope = f32(Math.atan(div(tangent[1], tangent[0]))),
      angle = sub(f32(-0.17453292), slope);
    const rotate = (p: number[]) => [add(mul(co, p[0]), mul(-si, p[1])), add(mul(si, p[0]), mul(co, p[1]))];
    for (let ci = 0; ci < splits.length - 1; ci++) {
      const a = splits[ci],
        b = splits[ci + 1];
      const row: RowContext = {
        side_index: 0,
        row_index: ri,
        column_index: ci,
        row_u: u,
        row_count: n,
        column_count: cols,
        split_interval: [a, b]
      };
      if (ci === 0)
        rows.push({ ...row, circle4: [0, 0, radius, f32(f.phase)], random_rotation_matrix4: [co, si, -si, co] });
      const pa = rotate(local(a, radius)),
        pb = rotate(local(b, radius)),
        mid = pa.map((v, i) => mul(add(v, pb[i]), 0.5));
      const pos = [add(ctr[0], mid[0]), height, add(ctr[1], mid[1])],
        rand = rng.next();
      const normal2 = rotate(local(mul(add(a, b), 0.5), 1)),
        normal = [normal2[0], 0, normal2[1]];
      const axis = cross(normal, [0, 1, 0]),
        along = rotation(normal, axis, -angle),
        z = cross(axis, along),
        quat = quaternionAxes(axis, along, z);
      const [dx, dz] = pa.map((v, i) => sub(v, pb[i])),
        width = sqrt(add(mul(dx, dx), mul(dz, dz)));
      const h = mul(length, add(mul(rand, 1.2), mul(sub(1, rand), 0.8))),
        scale = [width, h, metrics.depth];
      const tile = Math.min(1, Math.max(0, add(u, mul(rng.next(), 0.2))));
      emits.push(emit("ordinary_slope", pos, quat, scale, tile, row));
      if (ri === 0) {
        const half = along.map((v) => mul(mul(v, h), 0.5));
        const ap = [sub(pos[0], half[0]), add(pos[1], half[1]), sub(pos[2], half[2])];
        const bp = [add(pos[0], half[0]), add(pos[1], half[1]), add(pos[2], half[2])];
        const delta = ap.map((v, i) => sub(v, bp[i])),
          dist = sqrt(dot(delta, delta));
        if (dist > f32(0.1)) {
          const cq = quaternionAxes(axis, normal, [0, 1, 0]),
            center = ap.map((v, i) => add(mul(v, 0.5), mul(bp[i], 0.5)));
          const rec = emit("first_row_closure", center, cq, [width, dist, metrics.depth], 0, row);
          rec.original_endpoints = { a: ap, b: bp };
          emits.push(rec);
        }
      }
      ordinal++;
    }
  }
  return { observed_native_emits: emits, row_events: rows, native_entry: "0x10055b490" };
}

export interface ClosurePlacement {
  center: number[];
  slope_direction: number[];
  row_direction: number[];
  scale_width: number;
  scale_length: number;
  clip_plane: number[];
  seed: number;
  slot: number;
  row_index: bigint;
}
export function generateRoofClosure(p: ClosurePlacement) {
  if (
    !p ||
    Object.keys(p).sort().join() !==
      "center,clip_plane,row_direction,row_index,scale_length,scale_width,seed,slope_direction,slot"
  )
    throw Error("Explicit closure descriptor required");
  vector(p.center, 3);
  vector(p.slope_direction, 3);
  vector(p.row_direction, 3);
  vector(p.clip_plane, 4);
  vector([p.scale_width, p.scale_length], 2);
  if (p.scale_width < 0 || p.scale_length < 0 || p.row_direction[1] !== 0) throw Error("Invalid closure axes/scale");
  if (typeof p.row_index !== "bigint" || p.row_index < 0n || p.row_index >= 1n << 64n)
    throw Error("uint64 row index required");
  for (const v of [p.seed, p.slot])
    if (!Number.isInteger(v) || v < 0 || v >= 2 ** 32) throw Error("uint32 closure identity required");
  const result: {
    count: number;
    instances64_hex: string[];
    endpoints: { a: number[]; b: number[] }[];
    source_full_precision: NonNullable<RoofEmission["source_full_precision"]>[];
  } = { count: 0, instances64_hex: [], endpoints: [], source_full_precision: [] };
  if (p.row_index !== 0n) return result;
  const center = p.center.map(f32),
    half = p.slope_direction.map((v) => mul(mul(p.scale_length, v), 0.5));
  const a = center.map((c, i) => sub(c, half[i])),
    b = [add(center[0], half[0]), a[1], add(center[2], half[2])];
  result.endpoints = [{ a, b }];
  const delta = b.map((v, i) => sub(v, a[i])),
    length = sqrt(dot(delta, delta));
  if (length <= f32(0.1)) return result;
  const row = p.row_direction.map(f32),
    outward = [row[2], 0, -row[0]],
    quat = quaternionAxes(row, outward, [0, 1, 0]);
  const pos = a.map((v, i) => add(mul(v, 0.5), mul(b[i], 0.5))),
    scale = [f32(p.scale_width), length, f32(0.1)],
    clip = p.clip_plane.map(f32);
  result.count = 1;
  result.instances64_hex = [packRoof(pos, quat, scale, 0, p.slot, p.seed, 2, false, clip)];
  result.source_full_precision = [{ quaternion: quat, scale, tile_t: [0], clip_plane: clip }];
  return result;
}
