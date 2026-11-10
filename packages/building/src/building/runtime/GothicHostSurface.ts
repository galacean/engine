/** Original roof trigger mesh used by semantic dormer UV placement.
 * CPU equations recovered from 0x10055f670..0x100561168; renderer mesh is separate.
 * Browser transcendentals have the roof migration's declared numerical tolerance.
 */
import { add, sub, mul } from "./RecoveredRoofMath";
export interface GothicSupportMesh {
  triangles: number[][][];
  normals: number[][][];
  uvs: number[][][];
}
export function gothicRoofNoise(x: number, z: number): number {
  let ix = Math.floor(x),
    iz = Math.floor(z);
  x = sub(x, ix);
  z = sub(z, iz);
  ix = Math.min(0x7fffffff, Math.max(-0x80000000, ix));
  iz = Math.min(0x7fffffff, Math.max(-0x80000000, iz));
  const sx = mul(mul(x, x), sub(3, add(x, x))),
    sz = mul(mul(z, z), sub(3, add(z, z)));
  const bit = new DataView(new ArrayBuffer(4));
  const value = (i: number, j: number) => {
    let h = Math.imul(j, 1025) >>> 0;
    h = Math.imul(h ^ (h >>> 6), 9) >>> 0;
    h = Math.imul(h ^ (h >>> 11), 32769) >>> 0;
    h = (Math.imul((h + Math.imul(i, 1664525)) >>> 0, 1664525) + 0x0ae135d3) >>> 0;
    h ^= h >>> 11;
    h ^= (h << 7) & 0x9d2c5680;
    h ^= (h << 15) & 0xefc60000;
    h = (h & 0x7fffff) ^ (h >>> 18);
    bit.setUint32(0, (h | 0x3f800000) >>> 0, true);
    return sub(bit.getFloat32(0, true), 1);
  };
  const a = value(ix, iz),
    b = value(ix + 1, iz),
    c = value(ix, iz + 1),
    d = value(ix + 1, iz + 1);
  const p = add(a, mul(sub(b, a), sx)),
    q = add(c, mul(sub(d, c), sx));
  return add(p, mul(sz, sub(q, p)));
}
