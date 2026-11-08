/** Material-unit adapters for geometry/rule placements. Browser/Worker compatible.
 * Recovered BrickTransform::encode (0x1017cbf64), roof64 and wood80 layouts.
 * No original executable, scene snapshot, filesystem or GPU readback dependency.
 */
export function f32BitsToHalf(bits) {
  const sign = (bits >>> 16) & 0x8000,
    exponent = (bits >>> 23) & 255,
    fraction = bits & 0x7fffff;
  const round = (v, shift) => {
    const divisor = 2 ** shift,
      q = Math.floor(v / divisor),
      r = v - q * divisor;
    return q + Number(r > divisor / 2 || (r === divisor / 2 && q & 1));
  };
  if (exponent === 255) return sign | 0x7c00 | (fraction ? (fraction >>> 13) | 0x200 : 0);
  if (exponent >= 143) return sign | 0x7c00;
  if (exponent < 102) return sign;
  if (exponent <= 112) return sign | round(0x800000 | fraction, 126 - exponent);
  return sign | (((exponent - 112) << 10) + round(fraction, 13));
}
export function encodeBrick96(input) {
  if (!(input instanceof Uint8Array) || input.byteLength !== 96) throw Error("Expected brick domain96");
  const src = new DataView(input.buffer, input.byteOffset, 96),
    bytes = new Uint8Array(64),
    dst = new DataView(bytes.buffer);
  for (let i = 0; i < 9; i++) dst.setUint16(i * 2, f32BitsToHalf(src.getUint32(i * 4, true)), true);
  bytes.set(input.subarray(36, 48), 20);
  for (const [i, lane] of [12, 13, 14, 15, 16, 17, 18, 21, 22].entries())
    dst.setUint16(32 + i * 2, f32BitsToHalf(src.getUint32(lane * 4, true)), true);
  bytes.set(input.subarray(76, 84), 52);
  bytes.set(input.subarray(92, 96), 60);
  return bytes;
}
const finite = (v) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw Error("Finite geometry value required");
  return v;
};
const vector = (v, n) => {
  if (!Array.isArray(v) || v.length !== n) throw Error("Invalid geometry vector");
  v.forEach(finite);
  return v;
};
const uint = (v) => {
  if (!Number.isInteger(v) || v < 0 || v >= 2 ** 32) throw Error("uint32 required");
  return v;
};
function half(v) {
  finite(v);
  const sign = v < 0 || Object.is(v, -0) ? 0x8000 : 0;
  v = Math.abs(v);
  if (v === 0) return sign;
  const exponent = Math.max(-14, Math.floor(Math.log2(v))),
    step = 2 ** (exponent - 10),
    value = v / step,
    q = Math.floor(value),
    r = value - q;
  const rounded = q + Number(r > 0.5 || (r === 0.5 && q & 1));
  if (exponent > 15 || (exponent === 15 && rounded === 2048)) throw Error("Half float overflow");
  return sign | (exponent === -14 && rounded < 1024 ? rounded : ((exponent + 14) << 10) + rounded);
}
function fromHalf(bits) {
  const sign = bits & 0x8000 ? -1 : 1,
    e = (bits >>> 10) & 31,
    f = bits & 1023;
  return sign * (e === 31 ? (f ? NaN : Infinity) : e === 0 ? f * 2 ** -24 : (1024 + f) * 2 ** (e - 25));
}
function quaternion(columns) {
  const a = [0, 1, 2].map((i) => columns.map((c) => c[i])),
    trace = 0 + a[0][0] + a[1][1] + a[2][2];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return [(a[2][1] - a[1][2]) / s, (a[0][2] - a[2][0]) / s, (a[1][0] - a[0][1]) / s, s / 4];
  }
  let i = 0;
  for (let n = 1; n < 3; n++) if (a[n][n] > a[i][i]) i = n;
  const j = (i + 1) % 3,
    k = (i + 2) % 3,
    s = Math.sqrt(1 + a[i][i] - a[j][j] - a[k][k]) * 2,
    r = [0, 0, 0, 0];
  r[i] = s / 4;
  r[j] = (a[j][i] + a[i][j]) / s;
  r[k] = (a[k][i] + a[i][k]) / s;
  r[3] = (a[k][j] - a[j][k]) / s;
  return r;
}
function basis(q) {
  const k = Math.sqrt(q.reduce((s, x) => s + x * x, 0)),
    [x, y, z, w] = q.map((v) => v / k);
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
  ];
}
export function validateRoofDesign(value, cells, slot) {
  if (
    !value ||
    Object.keys(value).sort().join(",") !== "records,schema" ||
    value.schema !== "roof-design-v1" ||
    !Array.isArray(value.records)
  )
    throw Error("Invalid roof design");
  uint(slot);
  const byId = new Map(),
    result = new Map();
  for (const cell of cells) {
    if (typeof cell.id !== "string" || byId.has(cell.id)) throw Error("Invalid cell IDs");
    byId.set(cell.id, cell);
  }
  for (const r of value.records) {
    if (Object.keys(r).sort().join(",") !== "cell_id,initial64_hex,quaternion_f32,world_height_origin")
      throw Error("Invalid roof record");
    if (
      !byId.has(r.cell_id) ||
      result.has(r.cell_id) ||
      typeof r.initial64_hex !== "string" ||
      !/^[a-fA-F0-9]{128}$/.test(r.initial64_hex)
    )
      throw Error("Invalid roof record identity/bytes");
    const raw = Uint8Array.from(r.initial64_hex.match(/../g), (s) => parseInt(s, 16)),
      v = new DataView(raw.buffer),
      cell = byId.get(r.cell_id);
    for (let i = 0; i < 4; i++) finite(v.getFloat32(i * 4, true));
    for (let i = 16; i < 40; i += 2) finite(fromHalf(v.getUint16(i, true)));
    finite(v.getFloat32(48, true));
    if (
      v.getUint32(40, true) !== slot ||
      v.getFloat32(12, true) !== 0 ||
      v.getUint32(44, true) !== 0 ||
      v.getFloat32(48, true) !== 0
    )
      throw Error("Initial gravity/slot differs");
    const center = vector(cell.center, 3),
      origin = finite(r.world_height_origin);
    if (center.some((x, i) => x !== v.getFloat32(i * 4, true) + (i === 1 ? origin : 0)))
      throw Error("Roof center differs");
    const q = vector(r.quaternion_f32, 4),
      size = vector(cell.size, 3);
    if (
      q.some((x, i) => Math.fround(x) !== x || half(x) !== v.getUint16(32 + i * 2, true)) ||
      size.some((x, i) => half(x) !== v.getUint16(24 + i * 2, true))
    )
      throw Error("Roof packed geometry differs");
    basis(q).forEach((axis, i) => {
      const a = vector(cell[["tangent", "bitangent", "normal"][i]], 3);
      if (axis.some((x, j) => !(Math.abs(x - a[j]) <= 1e-12))) throw Error("Roof basis differs");
    });
    result.set(r.cell_id, raw);
  }
  if (result.size !== byId.size) throw Error("Roof records must cover all cells");
  return result;
}
/** One logical placement list -> all supported template instance buffers.
 * Footprint and IDs come from the rule, not the selected material. A derived
 * material representation may keep seed_id from its source placement while its
 * render/selection identity is distinct, avoiding unrelated texture reshuffles. */
export async function packUnits(spec) {
  if (spec.source_render_metadata != null) throw Error("Captured source metadata needs its explicit offline adapter");
  const { cells, slot } = spec;
  uint(slot);
  if (!Array.isArray(cells)) throw Error("Cells must be an array");
  const ids = new Set();
  for (const c of cells) {
    if (typeof c.id !== "string" || ids.has(c.id)) throw Error("Invalid cell identity");
    ids.add(c.id);
    for (const k of ["center", "tangent", "bitangent", "normal", "size"]) vector(c[k], 3);
    if (c.brick_deformation !== undefined) vector(c.brick_deformation, 4);
    if (c.brick_seed !== undefined) uint(c.brick_seed);
    if (c.brick_accent !== undefined && typeof c.brick_accent !== "boolean") throw Error("Invalid accent flag");
    if (c.brick_span !== undefined) vector(c.brick_span, 2);
    if (c.logical_id !== undefined && typeof c.logical_id !== "string") throw Error("Invalid logical ID");
    if (c.seed_id !== undefined && (typeof c.seed_id !== "string" || !c.seed_id)) throw Error("Invalid seed identity");
  }
  const design = spec.roof_design ? validateRoofDesign(spec.roof_design, cells, slot) : null;
  const seeds = await Promise.all(
    cells.map(
      async (c) =>
        new DataView(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(c.seed_id ?? c.logical_id ?? c.id))
        ).getUint32(0, true) & 0x7fffffff
    )
  );
  const result = {
    roof_tile: new Uint8Array(cells.length * 64),
    brick: new Uint8Array(cells.length * 64),
    wooden_plank: new Uint8Array(cells.length * 80)
  };
  cells.forEach((c, index) => {
    const columns = [c.tangent, c.bitangent, c.normal],
      mat = columns.flatMap((col, j) => col.map((x) => x * c.size[j])),
      seed = seeds[index];
    const b = new Uint8Array(96),
      bv = new DataView(b.buffer);
    [...mat, ...c.center].forEach((x, i) => bv.setFloat32(i * 4, x, true));
    if (c.brick_deformation) c.brick_deformation.forEach((x, i) => bv.setFloat32(48 + i * 4, x, true));
    [16, 17, 18].forEach((i) => bv.setFloat32(i * 4, -100, true));
    // The brick shader draws seeds below 10 as accent stones.
    const brickSeed = c.brick_seed ?? seed;
    bv.setUint32(
      76,
      c.brick_accent === undefined ? brickSeed : c.brick_accent ? brickSeed % 10 : 10 + (brickSeed % 0x7ffffff0),
      true
    );
    if (c.brick_span) c.brick_span.forEach((x, i) => bv.setFloat32(84 + i * 4, x, true));
    bv.setUint32(80, slot, true);
    bv.setUint32(92, c.brick_flags === undefined ? 0 : uint(c.brick_flags), true);
    result.brick.set(encodeBrick96(b), index * 64);
    const w = new DataView(result.wooden_plank.buffer, index * 80, 80),
      pos = c.center.map((x, i) => x - 0.5 * c.size[1] * columns[1][i]);
    [...mat, ...pos].forEach((x, i) => w.setFloat32(i * 4, x, true));
    w.setInt32(48, seed, true);
    w.setInt32(52, seed, true);
    w.setUint32(56, slot, true);
    if (design) {
      result.roof_tile.set(design.get(c.id), index * 64);
      return;
    }
    const r = new DataView(result.roof_tile.buffer, index * 64, 64);
    c.center.forEach((x, i) => r.setFloat32(i * 4, x, true));
    [0, 1, 0, 65504, ...c.size, 1, ...quaternion(columns)].forEach((x, i) => r.setUint16(16 + i * 2, half(x), true));
    r.setUint32(40, slot, true);
    r.setFloat32(48, 1, true);
    r.setInt32(52, seed, true);
    r.setInt32(60, 1, true);
  });
  return result;
}
