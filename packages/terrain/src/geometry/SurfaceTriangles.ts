import type { Float32Grid } from "./GridInterpolation";

export type SurfacePoint = readonly [number, number, number];
export type SurfaceTriangle = readonly [SurfacePoint, SurfacePoint, SurfacePoint];
export interface SurfaceRectangle {
  readonly minimumX: number;
  readonly minimumZ: number;
  readonly maximumX: number;
  readonly maximumZ: number;
}

/** Enumerate original host triangles, without resampling or changing their diagonals. */
export function gridSurfaceTriangles(
  grid: Float32Grid,
  bounds: SurfaceRectangle,
  height: (x: number, z: number) => number,
  diagonal: "ad" | "bc" = "ad"
): SurfaceTriangle[] {
  const triangles: SurfaceTriangle[] = [];
  // Include one boundary cell to account for Float32-rounded world coordinates.
  const minX = Math.max(0, Math.floor((bounds.minimumX - grid.origin[0]) / grid.spacing) - 1);
  const maxX = Math.min(grid.columns - 2, Math.ceil((bounds.maximumX - grid.origin[0]) / grid.spacing));
  const minZ = Math.max(0, Math.floor((bounds.minimumZ - grid.origin[1]) / grid.spacingZ) - 1);
  const maxZ = Math.min(grid.rows - 2, Math.ceil((bounds.maximumZ - grid.origin[1]) / grid.spacingZ));
  const vertex = (x: number, z: number): SurfacePoint => [
    Math.fround(grid.origin[0] + x * grid.spacing),
    height(x, z),
    Math.fround(grid.origin[1] + z * grid.spacingZ)
  ];
  for (let z = minZ; z <= maxZ; z++)
    for (let x = minX; x <= maxX; x++) {
      const a = vertex(x, z),
        b = vertex(x + 1, z),
        c = vertex(x, z + 1),
        d = vertex(x + 1, z + 1);
      if (a[0] >= bounds.maximumX || d[0] <= bounds.minimumX || a[2] >= bounds.maximumZ || d[2] <= bounds.minimumZ)
        continue;
      if (diagonal === "ad") triangles.push([a, c, d], [a, d, b]);
      else triangles.push([a, c, b], [c, d, b]);
    }
  return triangles;
}

/** Clip in XZ; new heights remain on the original triangle plane. Upward winding is retained. */
export function clipSurfaceTriangles(
  triangles: readonly SurfaceTriangle[],
  bounds: SurfaceRectangle
): SurfaceTriangle[] {
  const result: SurfaceTriangle[] = [];
  for (const triangle of triangles) {
    let polygon: SurfacePoint[] = [...triangle];
    for (const [axis, boundary, sign] of [
      [0, bounds.minimumX, 1],
      [0, bounds.maximumX, -1],
      [2, bounds.minimumZ, 1],
      [2, bounds.maximumZ, -1]
    ] as const) {
      const next: SurfacePoint[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const insideA = sign * (a[axis] - boundary) >= 0,
          insideB = sign * (b[axis] - boundary) >= 0;
        if (insideA) next.push(a);
        if (insideA !== insideB) {
          const t = (boundary - a[axis]) / (b[axis] - a[axis]);
          const p: [number, number, number] = [
            a[0] + t * (b[0] - a[0]),
            a[1] + t * (b[1] - a[1]),
            a[2] + t * (b[2] - a[2])
          ];
          p[axis] = boundary;
          next.push(p);
        }
      }
      polygon = next;
    }
    for (let i = 1; i + 1 < polygon.length; i++) {
      const a = polygon[0],
        b = polygon[i],
        c = polygon[i + 1];
      const area = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      if (Math.abs(area) <= 1e-12) continue;
      result.push(area > 0 ? [a, b, c] : [a, c, b]);
    }
  }
  return result;
}

/** Exact triangles for hosts that explicitly own a horizontal plane. */
export function planeSurfaceTriangles(b: SurfaceRectangle, height = 0): SurfaceTriangle[] {
  const a: SurfacePoint = [b.minimumX, height, b.minimumZ],
    c: SurfacePoint = [b.minimumX, height, b.maximumZ],
    d: SurfacePoint = [b.maximumX, height, b.maximumZ],
    e: SurfacePoint = [b.maximumX, height, b.minimumZ];
  return [
    [a, c, d],
    [a, d, e]
  ];
}
