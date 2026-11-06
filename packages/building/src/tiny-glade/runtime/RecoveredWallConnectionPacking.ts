/** Recovered spawn_stitch_bricks 0x10092a11c and calculate_hash 0x1008faaf4.
 * Stable author IDs and global brick ordinal are inputs, never captured bytes. */
import { add, sub, mul } from "./RecoveredRoofMath";
import { encodeBrick96 } from "./UnitPacking.js";
import type { WallStitchPlacement } from "./WallConnectionTypes";
const mask = (1n << 64n) - 1n;
const rot = (v: bigint, n: bigint) => ((v << n) | (v >> (64n - n))) & mask;
/** Rust DefaultHasher SipHash-1-3 over ([u64;2],usize), including array length. */
function sipWords(words: bigint[]): number {
  let v0 = 0x736f6d6570736575n,
    v1 = 0x646f72616e646f6dn,
    v2 = 0x6c7967656e657261n,
    v3 = 0x7465646279746573n;
  function round() {
    v0 = (v0 + v1) & mask;
    v1 = rot(v1, 13n) ^ v0;
    v0 = rot(v0, 32n);
    v2 = (v2 + v3) & mask;
    v3 = rot(v3, 16n) ^ v2;
    v0 = (v0 + v3) & mask;
    v3 = rot(v3, 21n) ^ v0;
    v2 = (v2 + v1) & mask;
    v1 = rot(v1, 17n) ^ v2;
    v2 = rot(v2, 32n);
  }
  for (const word of words) {
    v3 ^= word;
    round();
    v0 ^= word;
  }
  v2 ^= 255n;
  round();
  round();
  round();
  return Number((v0 ^ v1 ^ v2 ^ v3) & 0xffffffffn);
}
export function wallConnectionHash(pair: readonly bigint[], ordinal: number): number {
  return sipWords([2n, ...pair, BigInt(ordinal), 32n << 56n]);
}
function affineBasis(p: WallStitchPlacement) {
  const [x, y, z, w] = p.quaternion,
    xx = mul(x, add(x, x)),
    yy = mul(y, add(y, y)),
    zz = mul(z, add(z, z)),
    xy = mul(x, add(y, y)),
    xz = mul(x, add(z, z)),
    yz = mul(y, add(z, z)),
    wx = mul(w, add(x, x)),
    wy = mul(w, add(y, y)),
    wz = mul(w, add(z, z));
  return [
    [sub(1, add(yy, zz)), add(xy, wz), sub(xz, wy)],
    [sub(xy, wz), sub(1, add(xx, zz)), add(yz, wx)],
    [add(xz, wy), sub(yz, wx), sub(1, add(xx, yy))]
  ];
}
export function packWallConnectionBrick(
  p: WallStitchPlacement,
  globalOrdinal: number,
  slots: ReadonlyMap<bigint, number>
) {
  if (p.unit !== "brick") throw Error("Brick placement required; beam packing has its own producer");
  const primary = p.wallIds[globalOrdinal & 1],
    slot = slots.get(primary);
  if (slot === undefined) throw Error("Missing wall render slot");
  const basis = affineBasis(p);
  const domain96 = new Uint8Array(96),
    v = new DataView(domain96.buffer);
  [...basis.flatMap((b, i) => b.map((x) => mul(x, p.scale[i]))), ...p.position].forEach((x, i) =>
    v.setFloat32(i * 4, x, true)
  );
  [64, 68, 72].forEach((o) => v.setFloat32(o, -100, true));
  v.setUint32(76, wallConnectionHash(p.wallSeeds ?? p.wallIds, globalOrdinal), true);
  v.setUint32(80, slot, true);
  v.setFloat32(84, -0.1, true);
  v.setFloat32(88, 0.1, true);
  v.setUint32(92, p.kinds[globalOrdinal & 1] === 1 ? 8196 : 4, true);
  return { primaryWallId: primary, slot, domain96, packed64: encodeBrick96(domain96), basis };
}

/** Original spawn_stitch_beams 0x100929a30, distinct hash and flag owner. */
export function packWallConnectionBeam(
  p: WallStitchPlacement,
  beamOrdinal: number,
  slots: ReadonlyMap<bigint, number>
) {
  if (p.unit !== "wooden_plank" || p.selectedWallId === undefined) throw Error("Beam owner required");
  const primary = p.selectedWallId,
    slot = slots.get(primary);
  if (slot === undefined) throw Error("Missing wall render slot");
  const basis = affineBasis(p),
    packed80 = new Uint8Array(80),
    v = new DataView(packed80.buffer);
  [...basis.flatMap((b, i) => b.map((x) => mul(x, p.scale[i]))), ...p.position].forEach((x, i) =>
    v.setFloat32(i * 4, x, true)
  );
  const seed = p.wallSeeds?.[p.wallIds.indexOf(primary)] ?? primary;
  v.setUint32(48, sipWords([seed, BigInt(beamOrdinal), 20n << 56n]), true);
  v.setUint32(52, sipWords([seed, BigInt(beamOrdinal), (20n << 56n) | 1n]), true);
  v.setUint32(56, slot, true);
  v.setUint32(60, p.selectedKind === 3 ? 33 : 1, true);
  return { primaryWallId: primary, slot, packed80, basis };
}
