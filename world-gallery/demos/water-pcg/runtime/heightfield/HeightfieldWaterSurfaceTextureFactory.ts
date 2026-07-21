/** Builds the small tileable slope/noise texture used by the flow-map water shader. */
import { Engine, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine-core";
import { HEIGHTFIELD_WATER_SURFACE_TEXTURE, HEIGHTFIELD_WATER_SURFACE_TEXTURE_RANDOM } from "./constants";

const cachedTextures = new WeakMap<Engine, Texture2D>();

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function smoothCurve(value: number): number {
  return value * value * (3 - value * 2);
}

function gridHash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + seed * 17, 0x45d9f3b) ^ Math.imul(y + seed * 31, 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function periodicValueNoise(pixelX: number, pixelY: number, cellCount: number, seed: number): number {
  const size = HEIGHTFIELD_WATER_SURFACE_TEXTURE.size;
  const x = (pixelX / size) * cellCount;
  const y = (pixelY / size) * cellCount;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const localX = smoothCurve(x - cellX);
  const localY = smoothCurve(y - cellY);
  const x0 = positiveModulo(cellX, cellCount);
  const y0 = positiveModulo(cellY, cellCount);
  const x1 = positiveModulo(cellX + 1, cellCount);
  const y1 = positiveModulo(cellY + 1, cellCount);
  const bottom = gridHash(x0, y0, seed) * (1 - localX) + gridHash(x1, y0, seed) * localX;
  const top = gridHash(x0, y1, seed) * (1 - localX) + gridHash(x1, y1, seed) * localX;
  return bottom * (1 - localY) + top * localY;
}

function surfaceHeight(pixelX: number, pixelY: number, seedOffset: number): number {
  const texture = HEIGHTFIELD_WATER_SURFACE_TEXTURE;
  const random = HEIGHTFIELD_WATER_SURFACE_TEXTURE_RANDOM;
  return (
    periodicValueNoise(pixelX, pixelY, texture.firstCellCount, random.firstSeed + seedOffset) * texture.firstWeight +
    periodicValueNoise(pixelX, pixelY, texture.secondCellCount, random.secondSeed + seedOffset) * texture.secondWeight +
    periodicValueNoise(pixelX, pixelY, texture.thirdCellCount, random.thirdSeed + seedOffset) * texture.thirdWeight
  );
}

function encodeSigned(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value * 0.5 + 0.5)) * 255);
}

/**
 * RG stores a periodic height-field gradient. B and A store two decorrelated scalar fields used
 * to break up shoreline and current foam. CPU generation keeps the shader input deterministic.
 */
export function buildHeightfieldWaterSurfaceTexturePixels(): Uint8Array {
  const { size, gradientStrength } = HEIGHTFIELD_WATER_SURFACE_TEXTURE;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const slopeX = (surfaceHeight(x - 1, y, 0) - surfaceHeight(x + 1, y, 0)) * gradientStrength;
      const slopeY = (surfaceHeight(x, y - 1, 0) - surfaceHeight(x, y + 1, 0)) * gradientStrength;
      const offset = (y * size + x) * 4;
      pixels[offset] = encodeSigned(slopeX);
      pixels[offset + 1] = encodeSigned(slopeY);
      pixels[offset + 2] = Math.round(surfaceHeight(x, y, 0) * 255);
      pixels[offset + 3] = Math.round(
        surfaceHeight(x, y, HEIGHTFIELD_WATER_SURFACE_TEXTURE_RANDOM.auxiliarySeedOffset) * 255
      );
    }
  }
  return pixels;
}

/** Returns one shared repeatable linear-space texture for each Engine. */
export function getHeightfieldWaterSurfaceTexture(engine: Engine): Texture2D {
  const existing = cachedTextures.get(engine);
  if (existing) return existing;
  const size = HEIGHTFIELD_WATER_SURFACE_TEXTURE.size;
  const texture = new Texture2D(engine, size, size, undefined, true, false);
  texture.name = "HeightfieldWaterSharedSurface";
  // Materials are recreated when quality changes; the per-engine cache is the texture owner.
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(buildHeightfieldWaterSurfaceTexturePixels());
  texture.generateMipmaps();
  cachedTextures.set(engine, texture);
  return texture;
}
