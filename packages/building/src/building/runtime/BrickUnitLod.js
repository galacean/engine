import { MaterialUnitLod } from "./MaterialUnitLod.js";
const HALF_SQRT3 = Math.sqrt(3) / 2;

function decodeHalf(b) {
  const e = (b >>> 10) & 31,
    m = b & 1023;
  return (b & 32768 ? -1 : 1) * (e === 0 ? m * 2 ** -24 : e === 31 ? Infinity : (1024 + m) * 2 ** (e - 25));
}

/** Native wall64 instance ABI, decoded once from authored instance bytes. No GPU readback.
 * Tiny Glade's screen metric uses the absolute first row of the packed basis,
 * multiplied by sqrt(3)/2. Keep that producer's conservative radius unchanged. */
export function brickLodBounds(bytes) {
  if (bytes.byteLength % 64) throw Error("Brick LOD requires complete wall64 records");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.byteLength / 64,
    bounds = new Float32Array(count * 4),
    cullRadius = new Float32Array(count),
    force = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * 64;
    const x = view.getFloat32(p + 20, true);
    const y = view.getFloat32(p + 24, true);
    const z = view.getFloat32(p + 28, true);
    const m00 = decodeHalf(view.getUint16(p, true)),
      m01 = decodeHalf(view.getUint16(p + 2, true)),
      m02 = decodeHalf(view.getUint16(p + 4, true));
    const m10 = decodeHalf(view.getUint16(p + 6, true)),
      m11 = decodeHalf(view.getUint16(p + 8, true)),
      m12 = decodeHalf(view.getUint16(p + 10, true));
    const m20 = decodeHalf(view.getUint16(p + 12, true)),
      m21 = decodeHalf(view.getUint16(p + 14, true)),
      m22 = decodeHalf(view.getUint16(p + 16, true));
    const r = (Math.abs(m00) + Math.abs(m10) + Math.abs(m20)) * HALF_SQRT3;
    const b4 = i * 4;
    bounds[b4] = x;
    bounds[b4 + 1] = y;
    bounds[b4 + 2] = z;
    bounds[b4 + 3] = r;
    const c0 = Math.hypot(m00, m01, m02);
    const c1 = Math.hypot(m10, m11, m12);
    const c2 = Math.hypot(m20, m21, m22);
    cullRadius[i] = 0.5 * (c0 + c1 + c2) + 0.35;
    if (
      !Number.isFinite(bounds[b4]) ||
      !Number.isFinite(bounds[b4 + 1]) ||
      !Number.isFinite(bounds[b4 + 2]) ||
      !Number.isFinite(bounds[b4 + 3]) ||
      !Number.isFinite(cullRadius[i])
    )
      throw Error("Non-finite brick LOD bounds");
    force[i] = (view.getUint32(p + 60, true) & 128) !== 0 ? 1 : 0;
  }
  return { bounds, cullRadius, force };
}

export function brickFeedbackLodBounds(source) {
  const count = source.count;
  const bounds = new Float32Array(count * 4);
  const cullRadius = new Float32Array(count);
  const force = new Uint8Array(count);
  if (source.kind === "pack") {
    const f = source.data;
    const u = new Uint32Array(f.buffer, f.byteOffset, f.byteLength >>> 2);
    for (let i = 0; i < count; i++) {
      const o = i * 20;
      const x = f[o + 9],
        y = f[o + 10],
        z = f[o + 11];
      const r = (Math.abs(f[o]) + Math.abs(f[o + 3]) + Math.abs(f[o + 6])) * HALF_SQRT3;
      const b4 = i * 4;
      bounds[b4] = x;
      bounds[b4 + 1] = y;
      bounds[b4 + 2] = z;
      bounds[b4 + 3] = r;
      const c0 = Math.hypot(f[o], f[o + 1], f[o + 2]);
      const c1 = Math.hypot(f[o + 3], f[o + 4], f[o + 5]);
      const c2 = Math.hypot(f[o + 6], f[o + 7], f[o + 8]);
      cullRadius[i] = 0.5 * (c0 + c1 + c2) + 0.35;
      if (
        !Number.isFinite(bounds[b4]) ||
        !Number.isFinite(bounds[b4 + 1]) ||
        !Number.isFinite(bounds[b4 + 2]) ||
        !Number.isFinite(bounds[b4 + 3]) ||
        !Number.isFinite(cullRadius[i])
      )
        throw Error("Non-finite brick feedback LOD bounds");
      force[i] = (u[o + 19] & 128) !== 0 ? 1 : 0;
    }
  } else {
    const p = source.grid;
    const cols = Math.trunc(p.columns[0]);
    const [w, h, stagger, r0] = p.grid;
    const [u0, u1, v0, v1] = p.bounds;
    const [cx, cz, cos, sin] = p.strip;
    const [gapU, gapV, gapLimit, trim] = p.gap;
    const groundY = p.groundY ?? 0;
    const joint = (span, gap) => span - (gapLimit < 0 ? gap : Math.min(gap, span * gapLimit));
    for (let i = 0; i < count; i++) {
      if (cols <= 0) continue;
      const r = Math.trunc(r0) + Math.floor(i / cols);
      const parity = ((r % 2) + 2) % 2;
      const c = Math.trunc(parity === 1 ? p.columns[2] : p.columns[1]) + (i % cols);
      if (c >= Math.trunc(parity === 1 ? p.oddEnd : p.columns[3])) continue;
      const shift = parity === 1 ? stagger : 0;
      let rx0 = (c + shift) * w,
        ry0 = r * h,
        rx1 = (c + 1 + shift) * w,
        ry1 = (r + 1) * h;
      if (trim > 0.5) {
        rx0 = Math.max(rx0, u0);
        ry0 = Math.max(ry0, v0);
        rx1 = Math.min(rx1, u1);
        ry1 = Math.min(ry1, v1);
        if (!(rx1 > rx0 && ry1 > ry0)) continue;
      }
      if (rx0 < u0 - 1e-6 || rx1 > u1 + 1e-6 || ry0 < v0 - 1e-6 || ry1 > v1 + 1e-6) continue;
      const sx = joint(rx1 - rx0, gapU),
        sy = joint(ry1 - ry0, gapV),
        sz = p.nominal[2];
      const stx = sx / p.nominal[0],
        sty = sy / p.nominal[1],
        stz = sz / p.nominal[2];
      if (
        stx < p.rangeMin[0] - 1e-6 ||
        sty < p.rangeMin[1] - 1e-6 ||
        stz < p.rangeMin[2] - 1e-6 ||
        stx > p.rangeMax[0] + 1e-6 ||
        sty > p.rangeMax[1] + 1e-6 ||
        stz > p.rangeMax[2] + 1e-6
      )
        continue;
      const x = (rx0 + rx1) * 0.5 - p.length * 0.5;
      const bx = cx + cos * x;
      const by = (ry0 + ry1) * 0.5 + groundY;
      const bz = cz + sin * x;
      const br = (Math.abs(cos * sx) + Math.abs(-sin * sz)) * HALF_SQRT3;
      const b4 = i * 4;
      bounds[b4] = bx;
      bounds[b4 + 1] = by;
      bounds[b4 + 2] = bz;
      bounds[b4 + 3] = br;
      cullRadius[i] = 0.5 * (sx + sy + sz) + 0.35;
      if (
        !Number.isFinite(bounds[b4]) ||
        !Number.isFinite(bounds[b4 + 1]) ||
        !Number.isFinite(bounds[b4 + 2]) ||
        !Number.isFinite(bounds[b4 + 3]) ||
        !Number.isFinite(cullRadius[i])
      )
        throw Error("Non-finite brick feedback LOD bounds");
    }
  }
  return { bounds, cullRadius, force };
}

/** Native threshold 30; 26..34 is the host complementary coverage band. */
export class BrickUnitLod extends MaterialUnitLod {
  static fromFeedback(source) {
    return new BrickUnitLod(brickFeedbackLodBounds(source));
  }
  constructor(bytesOrBounds) {
    const parsed = bytesOrBounds instanceof Uint8Array ? brickLodBounds(bytesOrBounds) : bytesOrBounds;
    super(parsed.bounds, parsed.force, 48, 60, null, parsed.cullRadius ?? null);
  }
}
