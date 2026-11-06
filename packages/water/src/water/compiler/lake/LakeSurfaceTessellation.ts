import type { LakePointXZ } from "../../authoring/lake/LakeBoundary";

/** Clip a conforming planar triangulation against one shared grid for optional vertex waves. */
export function tessellateLakeSurface(source: Float32Array, cellSize: number, maximumTriangles: number): Float32Array {
  const result: number[] = [];
  const clip = (polygon: LakePointXZ[], axis: 0 | 1, edge: number, positive: boolean): LakePointXZ[] => {
    const output: LakePointXZ[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const aInside = positive ? a[axis] >= edge : a[axis] <= edge;
      const bInside = positive ? b[axis] >= edge : b[axis] <= edge;
      if (aInside) output.push(a);
      if (aInside !== bInside) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        output.push(axis === 0 ? [edge, a[1] + (b[1] - a[1]) * t] : [a[0] + (b[0] - a[0]) * t, edge]);
      }
    }
    return output;
  };
  let visitedCells = 0;
  for (let offset = 0; offset < source.length; offset += 9) {
    const triangle: LakePointXZ[] = [0, 3, 6].map((i) => [source[offset + i], source[offset + i + 2]]);
    const minX = Math.floor(Math.min(...triangle.map((p) => p[0])) / cellSize);
    const maxX = Math.ceil(Math.max(...triangle.map((p) => p[0])) / cellSize);
    const minZ = Math.floor(Math.min(...triangle.map((p) => p[1])) / cellSize);
    const maxZ = Math.ceil(Math.max(...triangle.map((p) => p[1])) / cellSize);
    for (let z = minZ; z < maxZ; z++)
      for (let x = minX; x < maxX; x++) {
        if (++visitedCells > maximumTriangles * 8) throw new RangeError("Lake wave tessellation exceeds work budget.");
        let polygon = clip(triangle, 0, x * cellSize, true);
        polygon = clip(polygon, 0, (x + 1) * cellSize, false);
        polygon = clip(polygon, 1, z * cellSize, true);
        polygon = clip(polygon, 1, (z + 1) * cellSize, false);
        for (let i = 1; i + 1 < polygon.length; i++) {
          const a = polygon[0],
            b = polygon[i],
            c = polygon[i + 1];
          if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-10) continue;
          if (result.length / 9 >= maximumTriangles)
            throw new RangeError("Lake wave tessellation exceeds triangle budget.");
          for (const p of [a, b, c]) result.push(p[0], source[offset + 1], p[1]);
        }
      }
  }
  return new Float32Array(result);
}
