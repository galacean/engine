/** Material-unit adapters for geometry/rule placements. Browser/Worker compatible.
 * Recovered BrickTransform::encode (0x1017cbf64), roof64 and wood80 layouts.
 * No original executable, scene snapshot, filesystem or GPU readback dependency.
 */
const _f32Buf = new ArrayBuffer(4);
const _f32View = new DataView(_f32Buf);

function f32ToHalf(value) {
  _f32View.setFloat32(0, value, true);
  return f32BitsToHalf(_f32View.getUint32(0, true));
}

export function f32BitsToHalf(bits) {
  const sign = (bits >>> 16) & 0x8000,
    exponent = (bits >>> 23) & 255,
    fraction = bits & 0x7fffff;
  if (exponent === 255) return sign | 0x7c00 | (fraction ? (fraction >>> 13) | 0x200 : 0);
  if (exponent >= 143) return sign | 0x7c00;
  if (exponent < 102) return sign;
  if (exponent <= 112) {
    const shift = 126 - exponent;
    const v = 0x800000 | fraction;
    const q = v >>> shift;
    const r = v & ((1 << shift) - 1);
    const mid = 1 << (shift - 1);
    return sign | (q + (r > mid || (r === mid && (q & 1) !== 0) ? 1 : 0));
  }
  const q = fraction >>> 13;
  const r = fraction & 0x1fff;
  return sign | (((exponent - 112) << 10) + q + (r > 0x1000 || (r === 0x1000 && (q & 1) !== 0) ? 1 : 0));
}

const HALF_NEG_100 = f32ToHalf(-100);
const HALF_ZERO = f32ToHalf(0);
const HALF_ONE = f32ToHalf(1);
const HALF_MAX_FINITE = 0x7bff; // half(65504)

const SHA256_K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const _shaW = new Int32Array(64);
let _shaBuf = new Uint8Array(512);

/** Synchronous pure-JS SHA-256 returning little-endian first uint32 & 0x7fffffff (matches WebCrypto digest). */
function sha256SeedSync(str) {
  let byteLen = 0;
  let cap = _shaBuf.length;
  const ensureCap = (needed) => {
    if (needed <= cap) return;
    while (cap < needed) cap *= 2;
    const grown = new Uint8Array(cap);
    grown.set(_shaBuf.subarray(0, byteLen));
    _shaBuf = grown;
  };
  for (let i = 0, n = str.length; i < n; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      ensureCap(byteLen + 1);
      _shaBuf[byteLen++] = code;
    } else if (code < 0x800) {
      ensureCap(byteLen + 2);
      _shaBuf[byteLen++] = 0xc0 | (code >>> 6);
      _shaBuf[byteLen++] = 0x80 | (code & 0x3f);
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < n ? str.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        const cp = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        ensureCap(byteLen + 4);
        _shaBuf[byteLen++] = 0xf0 | (cp >>> 18);
        _shaBuf[byteLen++] = 0x80 | ((cp >>> 12) & 0x3f);
        _shaBuf[byteLen++] = 0x80 | ((cp >>> 6) & 0x3f);
        _shaBuf[byteLen++] = 0x80 | (cp & 0x3f);
      } else {
        ensureCap(byteLen + 3);
        _shaBuf[byteLen++] = 0xef;
        _shaBuf[byteLen++] = 0xbf;
        _shaBuf[byteLen++] = 0xbd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      ensureCap(byteLen + 3);
      _shaBuf[byteLen++] = 0xef;
      _shaBuf[byteLen++] = 0xbf;
      _shaBuf[byteLen++] = 0xbd;
    } else {
      ensureCap(byteLen + 3);
      _shaBuf[byteLen++] = 0xe0 | (code >>> 12);
      _shaBuf[byteLen++] = 0x80 | ((code >>> 6) & 0x3f);
      _shaBuf[byteLen++] = 0x80 | (code & 0x3f);
    }
  }
  const totalLen = ((byteLen + 9 + 63) >>> 6) << 6;
  ensureCap(totalLen);
  const buf = _shaBuf;
  buf[byteLen] = 0x80;
  buf.fill(0, byteLen + 1, totalLen - 8);
  const hiBits = Math.floor(byteLen / 0x20000000);
  const loBits = (byteLen << 3) >>> 0;
  buf[totalLen - 8] = (hiBits >>> 24) & 0xff;
  buf[totalLen - 7] = (hiBits >>> 16) & 0xff;
  buf[totalLen - 6] = (hiBits >>> 8) & 0xff;
  buf[totalLen - 5] = hiBits & 0xff;
  buf[totalLen - 4] = (loBits >>> 24) & 0xff;
  buf[totalLen - 3] = (loBits >>> 16) & 0xff;
  buf[totalLen - 2] = (loBits >>> 8) & 0xff;
  buf[totalLen - 1] = loBits & 0xff;

  let h0 = 0x6a09e667 | 0;
  let h1 = 0xbb67ae85 | 0;
  let h2 = 0x3c6ef372 | 0;
  let h3 = 0xa54ff53a | 0;
  let h4 = 0x510e527f | 0;
  let h5 = 0x9b05688c | 0;
  let h6 = 0x1f83d9ab | 0;
  let h7 = 0x5be0cd19 | 0;

  const w = _shaW;
  const k = SHA256_K;
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const o = offset + i * 4;
      w[i] = (buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3];
    }
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15];
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const w2 = w[i - 2];
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  return (
    (((h0 >>> 24) & 0xff) | ((h0 >>> 8) & 0xff00) | ((h0 << 8) & 0xff0000) | ((h0 << 24) & 0x7f000000)) >>> 0
  );
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
function hexNibble(c) {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 102) return c - 87;
  if (c >= 65 && c <= 70) return c - 55;
  return -1;
}
function parseHex64(hex) {
  const raw = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const hi = hexNibble(hex.charCodeAt(i * 2));
    const lo = hexNibble(hex.charCodeAt(i * 2 + 1));
    if (hi < 0 || lo < 0) return null;
    raw[i] = (hi << 4) | lo;
  }
  return raw;
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
      r.initial64_hex.length !== 128
    )
      throw Error("Invalid roof record identity/bytes");
    const raw = parseHex64(r.initial64_hex);
    if (!raw) throw Error("Invalid roof record identity/bytes");
    const v = new DataView(raw.buffer),
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
  for (let i = 0, n = cells.length; i < n; i++) {
    const c = cells[i];
    if (typeof c.id !== "string" || ids.has(c.id)) throw Error("Invalid cell identity");
    ids.add(c.id);
    vector(c.center, 3);
    vector(c.tangent, 3);
    vector(c.bitangent, 3);
    vector(c.normal, 3);
    vector(c.size, 3);
    if (c.brick_deformation !== undefined) vector(c.brick_deformation, 4);
    if (c.brick_seed !== undefined) uint(c.brick_seed);
    if (c.brick_accent !== undefined && typeof c.brick_accent !== "boolean") throw Error("Invalid accent flag");
    if (c.brick_span !== undefined) vector(c.brick_span, 2);
    if (c.logical_id !== undefined && typeof c.logical_id !== "string") throw Error("Invalid logical ID");
    if (c.seed_id !== undefined && (typeof c.seed_id !== "string" || !c.seed_id)) throw Error("Invalid seed identity");
  }
  const design =
    spec.roof_raw_records instanceof Map
      ? spec.roof_raw_records
      : spec.roof_design
        ? validateRoofDesign(spec.roof_design, cells, slot)
        : null;
  const allow = spec.materials ? (spec.materials instanceof Set ? spec.materials : new Set(spec.materials)) : null;
  const packRoof = !allow || allow.has("roof_tile");
  const packBrick = !allow || allow.has("brick");
  const packWood = !allow || allow.has("wooden_plank");
  const result = {
    roof_tile: new Uint8Array(packRoof ? cells.length * 64 : 0),
    brick: new Uint8Array(packBrick ? cells.length * 64 : 0),
    wooden_plank: new Uint8Array(packWood ? cells.length * 80 : 0)
  };
  const brickView = packBrick ? new DataView(result.brick.buffer) : null;
  const woodView = packWood ? new DataView(result.wooden_plank.buffer) : null;
  const roofView = packRoof && !design ? new DataView(result.roof_tile.buffer) : null;
  for (let index = 0, n = cells.length; index < n; index++) {
    const c = cells[index];
    // Compute the deterministic 31-bit visual variation seed lazily so roof_raw_records
    // and pre-seeded bricks skip SHA-256 hashing completely.
    const needsSeed = Boolean((brickView && c.brick_seed === undefined) || woodView || (packRoof && !design));
    const seed = needsSeed ? sha256SeedSync(c.seed_id ?? c.logical_id ?? c.id) : 0;
    const t = c.tangent,
      b = c.bitangent,
      nm = c.normal,
      sz = c.size,
      ctr = c.center;
    const s0 = sz[0],
      s1 = sz[1],
      s2 = sz[2];
    const m0 = t[0] * s0,
      m1 = t[1] * s0,
      m2 = t[2] * s0;
    const m3 = b[0] * s1,
      m4 = b[1] * s1,
      m5 = b[2] * s1;
    const m6 = nm[0] * s2,
      m7 = nm[1] * s2,
      m8 = nm[2] * s2;
    if (brickView) {
      const off = index * 64;
      brickView.setUint16(off, f32ToHalf(m0), true);
      brickView.setUint16(off + 2, f32ToHalf(m1), true);
      brickView.setUint16(off + 4, f32ToHalf(m2), true);
      brickView.setUint16(off + 6, f32ToHalf(m3), true);
      brickView.setUint16(off + 8, f32ToHalf(m4), true);
      brickView.setUint16(off + 10, f32ToHalf(m5), true);
      brickView.setUint16(off + 12, f32ToHalf(m6), true);
      brickView.setUint16(off + 14, f32ToHalf(m7), true);
      brickView.setUint16(off + 16, f32ToHalf(m8), true);
      brickView.setFloat32(off + 20, ctr[0], true);
      brickView.setFloat32(off + 24, ctr[1], true);
      brickView.setFloat32(off + 28, ctr[2], true);
      if (c.brick_deformation) {
        const def = c.brick_deformation;
        brickView.setUint16(off + 32, f32ToHalf(def[0]), true);
        brickView.setUint16(off + 34, f32ToHalf(def[1]), true);
        brickView.setUint16(off + 36, f32ToHalf(def[2]), true);
        brickView.setUint16(off + 38, f32ToHalf(def[3]), true);
      }
      brickView.setUint16(off + 40, HALF_NEG_100, true);
      brickView.setUint16(off + 42, HALF_NEG_100, true);
      brickView.setUint16(off + 44, HALF_NEG_100, true);
      if (c.brick_span) {
        brickView.setUint16(off + 46, f32ToHalf(c.brick_span[0]), true);
        brickView.setUint16(off + 48, f32ToHalf(c.brick_span[1]), true);
      }
      const brickSeed = c.brick_seed ?? seed;
      brickView.setUint32(
        off + 52,
        c.brick_accent === undefined ? brickSeed : c.brick_accent ? brickSeed % 10 : 10 + (brickSeed % 0x7ffffff0),
        true
      );
      brickView.setUint32(off + 56, slot, true);
      brickView.setUint32(off + 60, c.brick_flags === undefined ? 0 : uint(c.brick_flags), true);
    }
    if (woodView) {
      const off = index * 80;
      const hs1 = 0.5 * s1;
      woodView.setFloat32(off, m0, true);
      woodView.setFloat32(off + 4, m1, true);
      woodView.setFloat32(off + 8, m2, true);
      woodView.setFloat32(off + 12, m3, true);
      woodView.setFloat32(off + 16, m4, true);
      woodView.setFloat32(off + 20, m5, true);
      woodView.setFloat32(off + 24, m6, true);
      woodView.setFloat32(off + 28, m7, true);
      woodView.setFloat32(off + 32, m8, true);
      woodView.setFloat32(off + 36, ctr[0] - hs1 * b[0], true);
      woodView.setFloat32(off + 40, ctr[1] - hs1 * b[1], true);
      woodView.setFloat32(off + 44, ctr[2] - hs1 * b[2], true);
      woodView.setInt32(off + 48, seed, true);
      woodView.setInt32(off + 52, seed, true);
      woodView.setUint32(off + 56, slot, true);
      if (c.plank_flags !== undefined) woodView.setUint32(off + 60, uint(c.plank_flags), true);
    }
    if (!packRoof) continue;
    if (design) {
      const raw = design.get(c.id);
      if (!(raw instanceof Uint8Array) || raw.byteLength !== 64) {
        throw Error("Invalid roof_raw_records entry for cell " + c.id);
      }
      result.roof_tile.set(raw, index * 64);
      continue;
    }
    const off = index * 64;
    roofView.setFloat32(off, ctr[0], true);
    roofView.setFloat32(off + 4, ctr[1], true);
    roofView.setFloat32(off + 8, ctr[2], true);
    roofView.setUint16(off + 16, HALF_ZERO, true);
    roofView.setUint16(off + 18, HALF_ONE, true);
    roofView.setUint16(off + 20, HALF_ZERO, true);
    roofView.setUint16(off + 22, HALF_MAX_FINITE, true);
    roofView.setUint16(off + 24, half(s0), true);
    roofView.setUint16(off + 26, half(s1), true);
    roofView.setUint16(off + 28, half(s2), true);
    roofView.setUint16(off + 30, HALF_ONE, true);
    const trace = t[0] + b[1] + nm[2];
    let q0, q1, q2, q3;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      q0 = (b[2] - nm[1]) / s;
      q1 = (nm[0] - t[2]) / s;
      q2 = (t[1] - b[0]) / s;
      q3 = s / 4;
    } else if (t[0] >= b[1] && t[0] >= nm[2]) {
      const s = Math.sqrt(1 + t[0] - b[1] - nm[2]) * 2;
      q0 = s / 4;
      q1 = (b[0] + t[1]) / s;
      q2 = (nm[0] + t[2]) / s;
      q3 = (b[2] - nm[1]) / s;
    } else if (b[1] >= nm[2]) {
      const s = Math.sqrt(1 + b[1] - t[0] - nm[2]) * 2;
      q0 = (b[0] + t[1]) / s;
      q1 = s / 4;
      q2 = (nm[1] + b[2]) / s;
      q3 = (nm[0] - t[2]) / s;
    } else {
      const s = Math.sqrt(1 + nm[2] - t[0] - b[1]) * 2;
      q0 = (nm[0] + t[2]) / s;
      q1 = (nm[1] + b[2]) / s;
      q2 = s / 4;
      q3 = (t[1] - b[0]) / s;
    }
    roofView.setUint16(off + 32, half(q0), true);
    roofView.setUint16(off + 34, half(q1), true);
    roofView.setUint16(off + 36, half(q2), true);
    roofView.setUint16(off + 38, half(q3), true);
    roofView.setUint32(off + 40, slot, true);
    roofView.setFloat32(off + 48, 1, true);
    roofView.setInt32(off + 52, seed, true);
    roofView.setInt32(off + 60, 1, true);
  }
  return result;
}
