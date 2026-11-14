type LinearRGB = readonly [number, number, number];

export interface TerrainTextureRecipe {
  readonly size: number;
  readonly seed: number;
  readonly low: LinearRGB;
  readonly high: LinearRGB;
  /** Number of noise cells per tile. The tile repeats in both directions. */
  readonly frequency: number;
  readonly colorSpace: "sRGB" | "linear";
}

/** Generates opaque RGBA8 pixels. The caller owns image encoding, texture creation and layer binding. */
export function generateTerrainTexture(recipe: TerrainTextureRecipe): Uint8Array {
  const { size, seed, low, high, frequency, colorSpace } = recipe;
  if (!Number.isInteger(size) || size < 1 || size > 2048)
    throw new RangeError("Terrain texture size must be an integer from 1 to 2048");
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 128)
    throw new RangeError("Terrain texture frequency must be an integer from 1 to 128");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || ![...low, ...high].every((v) => v >= 0 && v <= 1))
    throw new RangeError("Terrain texture requires a uint32 seed and linear RGB values in [0, 1]");

  const noise = (x: number, y: number) => {
    let n = seed ^ Math.imul(x % frequency, 0x9e3779b1) ^ Math.imul(y % frequency, 0x85ebca77);
    n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
    n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
    return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
  };
  const ease = (t: number) => t * t * (3 - 2 * t);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const encode =
    colorSpace === "sRGB"
      ? (value: number) => (value < 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)
      : (value: number) => value;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = (y * frequency) / size;
    const iy = Math.floor(v);
    const fy = ease(v - iy);
    for (let x = 0; x < size; x++) {
      const u = (x * frequency) / size;
      const ix = Math.floor(u);
      const fx = ease(u - ix);
      const weight = mix(
        mix(noise(ix, iy), noise(ix + 1, iy), fx),
        mix(noise(ix, iy + 1), noise(ix + 1, iy + 1), fx),
        fy
      );
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels[offset + channel] = Math.round(encode(mix(low[channel], high[channel], weight)) * 255);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
