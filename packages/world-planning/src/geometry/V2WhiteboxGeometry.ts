import type { V2Mesh, V2PlacedBox } from "../spatial/V2Model.ts";

/** Bake many authored boxes into one mesh, preserving exact world dimensions and flat face normals. */
export function whiteboxGeometry(boxes: V2PlacedBox[]): V2Mesh {
  const positions: number[] = [],
    indices: number[] = [];
  const faces = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3]
  ];
  for (const box of boxes) {
    const c = Math.cos(box.yaw),
      s = Math.sin(box.yaw);
    for (const face of faces) {
      const start = positions.length / 3;
      for (const i of face) {
        const x = ((i & 1 ? 1 : -1) * box.sizeX) / 2,
          z = ((i & 2 ? 1 : -1) * box.sizeZ) / 2;
        positions.push(box.center.x + c * x - s * z, box.baseY + (i & 4 ? box.sizeY : 0), box.center.z + s * x + c * z);
      }
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
  return { positions, indices };
}
