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
/** Native threshold 30; 26..34 is the host complementary coverage band. */
export class BrickUnitLod extends MaterialUnitLod {
  constructor(bytes) {
    const { bounds, force } = brickLodBounds(bytes);
    super(bounds, force, 26, 34);
  }
}
