import { MaterialUnitLod } from "./MaterialUnitLod.js";
/** Native wall64 instance ABI, decoded once from authored instance bytes. No GPU readback.
 * Tiny Glade's screen metric uses the absolute first row of the packed basis,
 * multiplied by sqrt(3)/2. Keep that producer's conservative radius unchanged. */
export function brickLodBounds(bytes) {
  if (bytes.byteLength % 64) throw Error("Brick LOD requires complete wall64 records");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = bytes.byteLength / 64,
    bounds = new Float32Array(count * 4),
    force = new Uint8Array(count);
  const half = (p) => {
    const b = view.getUint16(p, true),
      e = (b >>> 10) & 31,
      m = b & 1023;
    return (b & 32768 ? -1 : 1) * (e === 0 ? m * 2 ** -24 : e === 31 ? Infinity : (1024 + m) * 2 ** (e - 25));
  };
  for (let i = 0; i < count; i++) {
    const p = i * 64;
    bounds[i * 4] = view.getFloat32(p + 20, true);
    bounds[i * 4 + 1] = view.getFloat32(p + 24, true);
    bounds[i * 4 + 2] = view.getFloat32(p + 28, true);
    bounds[i * 4 + 3] = ((Math.abs(half(p)) + Math.abs(half(p + 6)) + Math.abs(half(p + 12))) * Math.sqrt(3)) / 2;
    force[i] = (view.getUint32(p + 60, true) & 128) !== 0 ? 1 : 0;
  }
  if (!bounds.every(Number.isFinite)) throw Error("Non-finite brick LOD bounds");
  return { bounds, force };
}

export function brickFeedbackLodBounds(source) {
  const count = source.count;
  const bounds = new Float32Array(count * 4);
  const force = new Uint8Array(count);
  const k = Math.sqrt(3) / 2;
  if (source.kind === "pack") {
    const f = source.data;
    const u = new Uint32Array(f.buffer, f.byteOffset, f.byteLength >>> 2);
    for (let i = 0; i < count; i++) {
      const o = i * 20;
      bounds[i * 4] = f[o + 9];
      bounds[i * 4 + 1] = f[o + 10];
      bounds[i * 4 + 2] = f[o + 11];
      bounds[i * 4 + 3] = (Math.abs(f[o]) + Math.abs(f[o + 3]) + Math.abs(f[o + 6])) * k;
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
      bounds[i * 4] = cx + cos * x;
      bounds[i * 4 + 1] = (ry0 + ry1) * 0.5 + groundY;
      bounds[i * 4 + 2] = cz + sin * x;
      bounds[i * 4 + 3] = (Math.abs(cos * sx) + Math.abs(-sin * sz)) * k;
    }
  }
  if (!bounds.every(Number.isFinite)) throw Error("Non-finite brick feedback LOD bounds");
  return { bounds, force };
}

/** Native threshold 30; 26..34 is the host complementary coverage band. */
export class BrickUnitLod extends MaterialUnitLod {
  static fromFeedback(source) {
    return new BrickUnitLod(brickFeedbackLodBounds(source));
  }
  constructor(bytesOrBounds) {
    const { bounds, force } = bytesOrBounds instanceof Uint8Array ? brickLodBounds(bytesOrBounds) : bytesOrBounds;
    super(bounds, force, 48, 60);
  }
}
