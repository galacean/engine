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

function gridIndex(value: number, origin: number, spacing: number, count: number): number {
  let index = Math.max(0, Math.min(count - 2, Math.floor((value - origin) / spacing)));
  if (index > 0 && value < Math.fround(origin + index * spacing)) index--;
  // Internal edges belong to the positive-side cell in the GPU's Float32 domain.
  if (index < count - 2 && value >= Math.fround(origin + (index + 1) * spacing)) index++;
  return index;
}
function gridFraction(value: number, origin: number, spacing: number, index: number): number {
  const start = Math.fround(origin + index * spacing),
    end = Math.fround(origin + (index + 1) * spacing);
  return Math.max(0, Math.min(1, (value - start) / (end - start)));
}
function gridAxis(value: number, origin: number, spacing: number, count: number) {
  const index = gridIndex(value, origin, spacing, count);
  return [
    index,
    gridFraction(value, origin, spacing, index),
    Math.fround(origin + index * spacing),
    Math.fround(origin + (index + 1) * spacing)
  ] as const;
}

/** Sample a retained raster without allocating a grid descriptor, axis tuples or a vertex callback. */
export function sampleFloat32GridRaster(
  samples: ArrayLike<number>,
  columns: number,
  rows: number,
  originX: number,
  originZ: number,
  spacingX: number,
  spacingZ: number,
  x: number,
  z: number
): number {
  const ix = gridIndex(x, originX, spacingX, columns),
    iz = gridIndex(z, originZ, spacingZ, rows);
  const u = gridFraction(x, originX, spacingX, ix),
    v = gridFraction(z, originZ, spacingZ, iz);
  const a = iz * columns + ix,
    c = a + columns;
  return interpolateGridTriangle(samples[a]!, samples[a + 1]!, samples[c]!, samples[c + 1]!, u, v);
}

/** Write height to sample[2]; sample[0..1] hold world X/Z. The grid is retained by the caller. */
export function sampleFloat32GridRasterInto(grid: Float32Grid, samples: ArrayLike<number>, sample: Float64Array): void {
  const x = sample[0]!,
    z = sample[1]!;
  const ix = gridIndex(x, grid.origin[0], grid.spacing, grid.columns),
    iz = gridIndex(z, grid.origin[1], grid.spacingZ, grid.rows);
  const u = gridFraction(x, grid.origin[0], grid.spacing, ix),
    v = gridFraction(z, grid.origin[1], grid.spacingZ, iz);
  const a = iz * grid.columns + ix,
    c = a + grid.columns;
  sample[2] = interpolateGridTriangle(samples[a]!, samples[a + 1]!, samples[c]!, samples[c + 1]!, u, v);
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
  const ix = gridIndex(x, grid.origin[0], grid.spacing, grid.columns),
    iz = gridIndex(z, grid.origin[1], grid.spacingZ, grid.rows);
  const u = gridFraction(x, grid.origin[0], grid.spacing, ix),
    v = gridFraction(z, grid.origin[1], grid.spacingZ, iz);
  return interpolateGridTriangle(vertex(ix, iz), vertex(ix + 1, iz), vertex(ix, iz + 1), vertex(ix + 1, iz + 1), u, v);
}
