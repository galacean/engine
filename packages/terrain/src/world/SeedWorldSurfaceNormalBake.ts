/** Immutable source for one repeating, unmasked normal tile. */
export interface SurfaceNormalBakeInput {
  resolution: number;
  pattern: Uint8Array;
}
const SPACING = 0.36199188232421875;
/** Resolution of the shipped unmasked RGB8 normal tile. */
export const SURFACE_NORMAL_RESOLUTION = 256;
/** Full mirrored pattern period, in metres, matching the shader height coordinates. */
export const SURFACE_NORMAL_REPEAT_PERIOD = 2 / 0.05000000074505806;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function bilinear(bytes: Uint8Array, edge: number, x: number, y: number): number {
  x = clamp(x, 0, edge - 1);
  y = clamp(y, 0, edge - 1);
  const ix = Math.floor(x),
    iy = Math.floor(y),
    tx = x - ix,
    ty = y - iy;
  const nx = Math.min(ix + 1, edge - 1),
    ny = Math.min(iy + 1, edge - 1);
  return (
    ((bytes[iy * edge + ix] * (1 - tx) + bytes[iy * edge + nx] * tx) * (1 - ty) +
      (bytes[ny * edge + ix] * (1 - tx) + bytes[ny * edge + nx] * tx) * ty) /
    255
  );
}
const mirror = (u: number) => 1 - Math.abs((((u % 2) + 2) % 2) - 1);

/** Evaluates the same carrier-node normals and triangle interpolation as the live shader.
 * Returns a reusable vector; callers must consume it before the next evaluation.
 */
export function createSurfaceNormalEvaluator(
  input: SurfaceNormalBakeInput,
  spacing = SURFACE_NORMAL_REPEAT_PERIOD / Math.round(SURFACE_NORMAL_REPEAT_PERIOD / SPACING)
): (x: number, z: number) => Float64Array {
  const patternEdge = Math.sqrt(input.pattern.length);
  if (!Number.isInteger(patternEdge) || patternEdge < 2) throw Error("Invalid surface normal bake source");
  const heights = new Float64Array(16),
    nodes = new Float64Array(9),
    result = new Float64Array(3);
  const height = (x: number, z: number) => {
    const u = mirror(x * 0.05000000074505806);
    const v = 1 - mirror(-z * 0.05000000074505806);
    const pattern = clamp(
      (bilinear(input.pattern, patternEdge, u * patternEdge - 0.5, v * patternEdge - 0.5) - 0.1752408761) /
        0.7947308464,
      0,
      1
    );
    return -1.7999999523162842 * (0.7931822538375854 + (pattern - 0.7931822538375854));
  };
  // Each corner joins perpendicular horizontal carrier edges; their dot product is dy1*dy2.
  const quad = (a: number, b: number, c: number, d: number, dy1: number, dy2: number, at: number) => {
    const x = a + c - b - d,
      y = spacing * 2,
      z = a + b - c - d;
    const angle = Math.acos(clamp((dy1 * dy2) / (Math.hypot(spacing, dy1) * Math.hypot(spacing, dy2)), -1, 1));
    const weight = angle / Math.hypot(x, y, z);
    nodes[at] += x * weight;
    nodes[at + 1] += y * weight;
    nodes[at + 2] += z * weight;
  };
  const node = (i: number, at: number) => {
    const h = heights,
      cc = h[i],
      west = h[i - 1] - cc,
      east = h[i + 1] - cc;
    const south = h[i - 4] - cc,
      north = h[i + 4] - cc;
    nodes[at] = nodes[at + 1] = nodes[at + 2] = 0;
    quad(h[i - 5], h[i - 4], h[i - 1], cc, west, south, at);
    quad(h[i - 4], h[i - 3], cc, h[i + 1], south, east, at);
    quad(h[i - 1], cc, h[i + 3], h[i + 4], north, west, at);
    quad(cc, h[i + 1], h[i + 4], h[i + 5], east, north, at);
    const length = Math.hypot(nodes[at], nodes[at + 1], nodes[at + 2]);
    for (let k = 0; k < 3; k++) nodes[at + k] /= length;
  };
  return (x, z) => {
    const gx = x / spacing,
      gz = z / spacing,
      ix = Math.floor(gx),
      iz = Math.floor(gz);
    const fx = gx - ix,
      fz = gz - iz;
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) heights[j * 4 + i] = height((ix + i - 1) * spacing, (iz + j - 1) * spacing);
    node(6, 0);
    node(9, 3);
    if (fx + fz <= 1) {
      node(5, 6);
      for (let k = 0; k < 3; k++) result[k] = nodes[6 + k] * (1 - fx - fz) + nodes[k] * fx + nodes[3 + k] * fz;
    } else {
      node(10, 6);
      for (let k = 0; k < 3; k++)
        result[k] = nodes[6 + k] * (fx + fz - 1) + nodes[k] * (1 - fz) + nodes[3 + k] * (1 - fx);
    }
    const length = Math.hypot(...result);
    for (let k = 0; k < 3; k++) result[k] /= length;
    return result;
  };
}

/** Samples the virtual normal field into a periodic linear RGB8 map with XYZ normals.
 * Progress is per completed row. No coverage, physical terrain slope or light is baked.
 */
export function bakeSurfaceNormals(input: SurfaceNormalBakeInput, progress?: (fraction: number) => void): Uint8Array {
  const resolution = input.resolution;
  if (![128, 256, 512, 1024, 2048].includes(resolution)) throw Error("Unsupported normal bake resolution");
  // An integer number of carrier cells closes the periodic lattice without a seam.
  // 110 cells per mirrored period gives 0.363636 m, within 0.5% of the live spacing.
  const evaluate = createSurfaceNormalEvaluator(input),
    output = new Uint8Array(resolution ** 2 * 3);
  const spacing = SURFACE_NORMAL_REPEAT_PERIOD / resolution;
  for (let z = 0; z < resolution; z++) {
    for (let x = 0; x < resolution; x++) {
      // Keep the actual inclination at this world sample. Area-averaging unrelated
      // clumps cancels their slopes and is not equivalent to the live normal field.
      const [nx, ny, nz] = evaluate((x + 0.5) * spacing, (z + 0.5) * spacing);
      // Store components linearly so hardware filtering interpolates normals,
      // rather than interpolating a nonlinear direction encoding.
      const at = (z * resolution + x) * 3;
      output[at] = Math.round((nx * 0.5 + 0.5) * 255);
      output[at + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      output[at + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
    if (z % 8 === 0 || z === resolution - 1) progress?.((z + 1) / resolution);
  }
  return output;
}
