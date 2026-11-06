import type { V3 } from "./types";

export interface SurfaceTriangle {
  a: V3;
  b: V3;
  c: V3;
  area: number;
  bounds: [number, number, number, number];
}
const cross = (a: V3, b: V3, x: number, z: number) => (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);

/** Shared raster input for both directions of the paired-ring construction. */
export function surfaceTriangle(a: V3, b: V3, c: V3): SurfaceTriangle | undefined {
  const area = cross(a, b, c[0], c[2]);
  if (Math.abs(area) < 1e-12) return;
  return {
    a,
    b,
    c,
    area,
    bounds: [
      Math.min(a[0], b[0], c[0]),
      Math.min(a[2], b[2], c[2]),
      Math.max(a[0], b[0], c[0]),
      Math.max(a[2], b[2], c[2])
    ]
  };
}

export function triangleHeight(t: SurfaceTriangle, x: number, z: number): number {
  if (x < t.bounds[0] - 1e-8 || z < t.bounds[1] - 1e-8 || x > t.bounds[2] + 1e-8 || z > t.bounds[3] + 1e-8)
    return -Infinity;
  const u = cross(t.b, t.c, x, z) / t.area,
    v = cross(t.c, t.a, x, z) / t.area,
    w = 1 - u - v;
  return Math.min(u, v, w) >= -1e-8 ? u * t.a[1] + v * t.b[1] + w * t.c[1] : -Infinity;
}
