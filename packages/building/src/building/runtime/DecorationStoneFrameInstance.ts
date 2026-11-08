import { f32BitsToHalf } from "./UnitPacking.js";

/** nani_solid_vertex_color_bricks / SolidVertexColorBricksInstanceData.
 * Verified by reflected SPIR-V and native updater 0x1015a0cec. The caller owns
 * placement and wall-range derivation; colour 999 selects this program on the
 * CPU and must never be encoded as a palette layer or dense wall slot. */
export interface DecorationStoneFrameInstance {
  /** Packed column-major affine basis XYZ followed by translation (12 f32). */
  xform: readonly number[];
  wallRange: readonly [number, number];
  seed: number;
  wallSlot: number;
  woodenWall: boolean;
  /** Original producer mesh_size_x (not necessarily the raw mesh AABB span). */
  meshSizeX: number;
}

export function packDecorationStoneFrameInstances(instances: readonly DecorationStoneFrameInstance[]): Uint8Array {
  const bytes = new Uint8Array(instances.length * 64),
    view = new DataView(bytes.buffer);
  const scalar = new DataView(new ArrayBuffer(4));
  const finite = (v: number) => Number.isFinite(v) && Number.isFinite(Math.fround(v));
  const half = (v: number) => {
    if (!finite(v)) throw Error("Finite stone-frame range required");
    scalar.setFloat32(0, v, true);
    const packed = f32BitsToHalf(scalar.getUint32(0, true));
    if ((packed & 0x7c00) === 0x7c00) throw Error("Stone-frame range exceeds binary16");
    return packed;
  };
  instances.forEach((instance, index) => {
    if (instance.xform.length !== 12 || !instance.xform.every(finite)) throw Error("Invalid stone-frame affine");
    if (instance.wallRange.length !== 2) throw Error("Invalid stone-frame range");
    if (!Number.isInteger(instance.seed) || instance.seed < 0 || instance.seed > 0xffffffff)
      throw Error("Stone-frame seed must fit uint32");
    if (!Number.isInteger(instance.wallSlot) || instance.wallSlot < 0 || instance.wallSlot > 0x7fffffff)
      throw Error("Stone-frame wall slot must fit 31 bits");
    if (typeof instance.woodenWall !== "boolean") throw Error("Invalid stone-frame wall material");
    if (!(Math.fround(instance.meshSizeX) > 0) || !finite(instance.meshSizeX))
      throw Error("Positive finite stone-frame mesh width required");
    const offset = index * 64;
    instance.xform.forEach((v, i) => view.setFloat32(offset + i * 4, v, true));
    view.setUint32(offset + 48, (half(instance.wallRange[0]) | (half(instance.wallRange[1]) << 16)) >>> 0, true);
    view.setUint32(offset + 52, instance.seed, true);
    view.setUint32(offset + 56, (instance.wallSlot | (instance.woodenWall ? 0x80000000 : 0)) >>> 0, true);
    view.setFloat32(offset + 60, instance.meshSizeX, true);
  });
  return bytes;
}
