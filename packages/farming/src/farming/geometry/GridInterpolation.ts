/** Height of the fixed grid triangles (a,c,d) and (a,d,b), split along a--d.
 * Fractions are local cell coordinates in [0,1]; callers own grid validation.
 */
export function interpolateGridTriangle(a: number, b: number, c: number, d: number, x: number, z: number): number {
  // Differences preserve a constant field exactly instead of accumulating three rounded products.
  return x <= z ? a + (c - a) * z + (d - c) * x : a + (b - a) * x + (d - b) * z;
}

export interface Float32Grid {
  readonly origin: readonly [number, number];
  readonly spacing: number;
  readonly spacingZ: number;
  readonly columns: number;
  readonly rows: number;
}

function gridAxis(value: number, origin: number, spacing: number, count: number) {
  let index = Math.max(0, Math.min(count - 2, Math.floor((value - origin) / spacing)));
  if (index > 0 && value < Math.fround(origin + index * spacing)) index--;
  // Internal edges belong to the positive-side cell: [start, end). Only the
  // final cell includes its end. Compare GPU-rounded edges, not the ideal lattice.
  if (index < count - 2 && value >= Math.fround(origin + (index + 1) * spacing)) index++;
  const start = Math.fround(origin + index * spacing),
    end = Math.fround(origin + (index + 1) * spacing);
  return [index, Math.max(0, Math.min(1, (value - start) / (end - start))), start, end] as const;
}

/** Locate an actual GPU cell, including rounding at large world coordinates. */
export function float32GridCell(grid: Float32Grid, x: number, z: number) {
  const [ix, u, x0, x1] = gridAxis(x, grid.origin[0], grid.spacing, grid.columns),
    [iz, v, z0, z1] = gridAxis(z, grid.origin[1], grid.spacingZ, grid.rows);
  return { ix, iz, x0, x1, z0, z1, u, v };
}

/** Sample the actual a--d triangles after vertex coordinates have entered the GPU's Float32 domain.
 * The vertex callback permits a contact query without allocating an entire raster.
 */
export function sampleFloat32GridTriangle(
  grid: Float32Grid,
  x: number,
  z: number,
  vertex: (x: number, z: number) => number
): number {
  const [ix, u] = gridAxis(x, grid.origin[0], grid.spacing, grid.columns),
    [iz, v] = gridAxis(z, grid.origin[1], grid.spacingZ, grid.rows);
  return interpolateGridTriangle(vertex(ix, iz), vertex(ix + 1, iz), vertex(ix, iz + 1), vertex(ix + 1, iz + 1), u, v);
}
