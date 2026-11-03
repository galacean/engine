const DRY_COLOR = [255, 247, 128] as const;
const TEMPERATE_COLOR = [255, 157, 45] as const;
const WET_COLOR = [190, 18, 42] as const;

/**
 * Compiles Worker moisture bytes into an opaque diagnostic color raster.
 * @param wetness Immutable normalized moisture bytes in row-major world-grid order.
 * @returns RGBA8 colors on one continuous yellow-orange-red moisture ramp.
 */
export function compileSeedWorldMoisturePixels(wetness: Uint8Array): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(wetness.length * 4);
  for (let index = 0; index < wetness.length; index++) {
    const moisture = wetness[index]! / 255;
    const start = moisture <= 0.5 ? DRY_COLOR : TEMPERATE_COLOR;
    const end = moisture <= 0.5 ? TEMPERATE_COLOR : WET_COLOR;
    const amount = moisture <= 0.5 ? moisture * 2 : moisture * 2 - 1;
    const pixel = index * 4;
    pixels[pixel] = interpolate(start[0], end[0], amount);
    pixels[pixel + 1] = interpolate(start[1], end[1], amount);
    pixels[pixel + 2] = interpolate(start[2], end[2], amount);
    pixels[pixel + 3] = 255;
  }
  return pixels;
}

function interpolate(start: number, end: number, amount: number): number {
  return Math.round(start + (end - start) * amount);
}
