/** Original plaster updater 0x1015988dc, with GPU addresses replaced by arena
 * offsets in units of 16 bytes, as required by the resident plaster shader. */
import type { generateWallPlaster } from "./RecoveredWallPlaster";
export interface WallPlasterGpuInput {
  mesh: ReturnType<typeof generateWallPlaster>;
  slot: number;
  controlLength: number;
  closed: boolean;
  peelStrength?: number;
}
export function packWallPlaster(walls: WallPlasterGpuInput[]) {
  let byteLength = 0,
    count = 0;
  for (const w of walls) {
    if (
      !Number.isInteger(w.slot) ||
      w.slot < 0 ||
      w.slot > 0xffffffff ||
      !Number.isFinite(w.controlLength) ||
      !(w.controlLength > 0) ||
      !Number.isFinite(w.peelStrength ?? 0)
    )
      throw Error("Invalid plaster GPU owner");
    for (const side of w.mesh.sides) {
      if (side.vertices48.byteLength !== side.columns * side.rows * 48) throw Error("Invalid plaster grid buffer");
      byteLength += side.vertices48.byteLength;
    }
    count += w.mesh.patches.length;
  }
  if (!Number.isSafeInteger(byteLength) || byteLength / 16 > 0xffffffff || count > 0xffffffff)
    throw Error("Plaster GPU arena exceeds uint32 addressing");
  const vertices48 = new Uint8Array(byteLength),
    instances48 = new Uint8Array(count * 48),
    view = new DataView(instances48.buffer),
    indirection = new Uint32Array(count);
  let cursor = 0,
    index = 0;
  for (const w of walls) {
    const starts = w.mesh.sides.map((side) => {
      const offset = cursor / 16;
      vertices48.set(side.vertices48, cursor);
      cursor += side.vertices48.byteLength;
      return offset;
    });
    for (const patch of w.mesh.patches) {
      const side = w.mesh.sides[patch.side];
      if (
        !side ||
        !Number.isInteger(patch.firstVertex) ||
        patch.firstVertex < 0 ||
        !Number.isInteger(patch.quadCount) ||
        patch.quadCount < 1 ||
        patch.quadCount > 32 ||
        patch.rowStride !== side.columns ||
        patch.firstVertex + patch.quadCount + patch.rowStride >= side.columns * side.rows ||
        patch.bounds.some((x) => !Number.isFinite(x))
      )
        throw Error("Invalid plaster patch");
      const o = index * 48;
      patch.bounds.forEach((v, k) => view.setFloat32(o + k * 4, v, true));
      view.setUint32(o + 16, w.slot, true);
      view.setFloat32(o + 20, w.controlLength, true);
      view.setUint32(o + 24, w.closed ? 1 : 0, true);
      view.setUint32(o + 28, patch.quadCount, true);
      view.setUint32(o + 32, starts[patch.side] + patch.firstVertex * 3, true);
      view.setUint32(o + 40, patch.rowStride, true);
      view.setFloat32(o + 44, w.peelStrength ?? 0, true);
      indirection[index] = index;
      index++;
    }
  }
  // Original quad mesh encodes row selection in bit 16 of each vertex index.
  const indices = new Uint32Array(32 * 6);
  for (let i = 0; i < 32; i++) indices.set([i + 65536, i, i + 1, i + 1, i + 65537, i + 65536], i * 6);
  return { vertices48, instances48, indirection, indices };
}
