import { f32BitsToHalf } from "./UnitPacking.js";

/** Reflected nani_gothic_window_bricks InstanceData_natural, scalar stride 128. */
export interface DecorationStoneInstance {
  /** Three column basis vectors followed by translation, exactly 12 f32 words. */
  xform: readonly number[];
  /** Original unsigned random seed bit pattern (stored in the native signed lane). */
  seed: number;
  wallSlot: number;
  wallRange: readonly [number, number];
  /** bit 0 = timber palette/mesh UV; bit 1 = wooden palette; bit 2 = rigid affine placement. */
  flags: number;
  /** Ordered left, middle and right attachment samples; used when bit 2 is clear. */
  bones: readonly [DecorationStoneBone, DecorationStoneBone, DecorationStoneBone];
  clipY: number;
}
export interface DecorationStoneBone {
  position: readonly [number, number, number];
  normalXZ: readonly [number, number];
}
const floatWord = new DataView(new ArrayBuffer(4));
const finite = (value: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
    throw Error("Finite f32 stone instance value required");
  return value;
};
function half(value: number) {
  floatWord.setFloat32(0, finite(value), true);
  const packed = f32BitsToHalf(floatWord.getUint32(0, true));
  if ((packed & 0x7c00) === 0x7c00) throw Error("Stone half-float field exceeds native binary16 range");
  return packed;
}
const packedPair = (value: readonly [number, number]) => {
  if (value.length !== 2) throw Error("Stone binary16 pair requires two components");
  return (half(value[0]) | (half(value[1]) << 16)) >>> 0;
};
const uint = (value: number) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw Error("Stone uint32 field required");
  return value;
};
export function packDecorationStoneInstances(instances: readonly DecorationStoneInstance[]): Uint8Array {
  const bytes = new Uint8Array(instances.length * 128),
    view = new DataView(bytes.buffer);
  for (let index = 0; index < instances.length; index++) {
    const value = instances[index],
      offset = index * 128;
    if (value.xform.length !== 12 || value.bones.length !== 3) throw Error("Stone affine/bone ABI differs");
    for (let word = 0; word < 12; word++) view.setFloat32(offset + word * 4, finite(value.xform[word]), true);
    view.setUint32(offset + 48, uint(value.seed), true);
    if (!Number.isInteger(value.wallSlot) || value.wallSlot < 0 || value.wallSlot > 0x7fffffff)
      throw Error("Stone wall slot must fit signed positive index");
    view.setInt32(offset + 52, value.wallSlot, true);
    view.setUint32(offset + 56, packedPair(value.wallRange), true);
    view.setUint32(offset + 60, uint(value.flags), true);
    for (let bone = 0; bone < 3; bone++) {
      const entry = value.bones[bone];
      if (entry.position.length !== 3) throw Error("Stone bone requires XYZ position");
      if ((value.flags & 4) === 0 && !(Math.hypot(...entry.normalXZ) > 0))
        throw Error("Warped stone bone requires nonzero XZ normal");
      for (let axis = 0; axis < 3; axis++)
        view.setFloat32(offset + 64 + bone * 16 + axis * 4, finite(entry.position[axis]), true);
      const normal = packedPair(entry.normalXZ);
      if ((value.flags & 4) === 0 && (normal & 0x7fff7fff) === 0)
        throw Error("Warped stone normal underflows binary16");
      view.setUint32(offset + 76 + bone * 16, normal, true);
    }
    view.setFloat32(offset + 112, finite(value.clipY), true);
    // Native pad0 occupies 116..127 and remains zero; no renderer state is captured.
  }
  return bytes;
}
