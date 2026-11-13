/** Linear data atlas: tangent-normal XY, unmixed pigment, brush coverage.
 * Baking the height gradient here replaces the reference's four neighbouring
 * height samples with a single texture read in each material fragment. */
export const OIL_BRUSH_COLUMNS = 4;
export const OIL_BRUSH_ROWS = 2;
export const OIL_BRUSH_CELL_SIZE = 128;
export const OIL_BRUSH_COUNT = OIL_BRUSH_COLUMNS * OIL_BRUSH_ROWS - 1;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hash = (x: number) => {
  let n = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const noise = (x: number, seed: number) => {
  const i = Math.floor(x),
    t = smooth(0, 1, x - i);
  return hash(i + seed * 65537) * (1 - t) + hash(i + 1 + seed * 65537) * t;
};

export function oilBrushUV(u: number, v: number, seed: number): [number, number] {
  const cell = Math.min(OIL_BRUSH_COUNT - 1, Math.floor(seed * OIL_BRUSH_COUNT));
  return [
    ((cell % OIL_BRUSH_COLUMNS) + u) / OIL_BRUSH_COLUMNS,
    (Math.floor(cell / OIL_BRUSH_COLUMNS) + v) / OIL_BRUSH_ROWS
  ];
}

/** The last cell is continuous brushed underpainting, without cutout holes. */
export function oilUnderpaintUV(u: number, v: number): [number, number] {
  const inset = 0.5 / OIL_BRUSH_CELL_SIZE;
  return [
    (OIL_BRUSH_COLUMNS - 1 + inset + u * (1 - 2 * inset)) / OIL_BRUSH_COLUMNS,
    (OIL_BRUSH_ROWS - 1 + inset + v * (1 - 2 * inset)) / OIL_BRUSH_ROWS
  ];
}

export function createOilPaintBrushData() {
  const size = OIL_BRUSH_CELL_SIZE;
  const width = size * OIL_BRUSH_COLUMNS,
    height = size * OIL_BRUSH_ROWS;
  const pixels = new Uint8Array(width * height * 4);
  for (let cell = 0; cell <= OIL_BRUSH_COUNT; cell++) {
    const heights = new Float32Array(size * size);
    const coverage = new Float32Array(size * size);
    const pigments = new Float32Array(size * size);
    const seed = cell + 1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (cell === OIL_BRUSH_COUNT) {
          const grain = (x / size) * 2 + noise((y / size) * 3, seed) * 0.08;
          heights[i] = 0.4 + 0.2 * noise(grain * 16, seed);
          coverage[i] = 1;
          pigments[i] = noise(grain * 4, seed + 19);
          continue;
        }
        const v = (y + 0.5) / size;
        const u = (2 * (x + 0.5)) / size - 1;
        // Pressure widens the loaded head; independent bristles run dry at
        // different lengths. Low-frequency wander follows the brush grain.
        const bend = (hash(seed) - 0.5) * 0.32;
        const across = u - bend * Math.sin(v * Math.PI) - (noise(v * 5, seed) - 0.5) * 0.06;
        const halfWidth = 0.74 * (0.86 + 0.14 * Math.sin(v * Math.PI));
        const start = 0.06 + noise(across * 6, seed + 3) * 0.045;
        const end = 0.92 - noise(across * 8, seed + 5) * 0.18;
        const dry = smooth(end - 0.24, end, v);
        const bristle = noise(across * 22, seed + 7);
        const edge = 1 - smooth(halfWidth - 0.1, halfWidth, Math.abs(across));
        const alpha =
          edge *
          smooth(start, start + 0.035, v) *
          (1 - smooth(end - 0.02, end + 0.02, v)) *
          smooth(dry * 0.5 - 0.1, dry * 0.5 + 0.05, bristle);
        const ridge = noise(across * 16 + noise(v * 3, seed + 11), seed + 13);
        const squeeze = smooth(halfWidth - 0.3, halfWidth - 0.06, Math.abs(across));
        heights[i] = alpha * (0.35 + 0.25 * ridge + 0.18 * squeeze + 0.2 * (1 - v));
        coverage[i] = alpha;
        pigments[i] = noise(across * 4 + noise(v * 2, seed + 17) * 0.7, seed + 19);
      }
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        // A paint layer about 1/64 of the brush width. Central differences
        // differentiate its height in brush coordinates, independent of texel size.
        const dx =
          ((heights[y * size + Math.min(x + 1, size - 1)] - heights[y * size + Math.max(x - 1, 0)]) * size) / 128;
        const dy =
          ((heights[Math.min(y + 1, size - 1) * size + x] - heights[Math.max(y - 1, 0) * size + x]) * size) / 128;
        const length = Math.hypot(dx, dy, 1);
        const target =
          ((Math.floor(cell / OIL_BRUSH_COLUMNS) * size + y) * width + (cell % OIL_BRUSH_COLUMNS) * size + x) * 4;
        pixels[target] = Math.round((0.5 - (dx / length) * 0.5) * 255);
        pixels[target + 1] = Math.round((0.5 - (dy / length) * 0.5) * 255);
        pixels[target + 2] = Math.round(pigments[i] * 255);
        pixels[target + 3] = Math.round(coverage[i] * 255);
      }
    }
  }
  return { width, height, pixels };
}
