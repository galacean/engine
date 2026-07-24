/** Deterministic, tileable RGB micro-foam used under bounded macro foam. */
import {
  Engine,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode
} from "@galacean/engine-core";

export interface WaterFoamDetailTextureDescriptor {
  readonly size: number;
  readonly seed: number;
  readonly broadCellCount: number;
  readonly mediumCellCount: number;
  readonly fineCellCount: number;
}

export const DEFAULT_WATER_FOAM_DETAIL_TEXTURE_DESCRIPTOR =
  Object.freeze({
    size: 256,
    seed: 20260724,
    broadCellCount: 5,
    mediumCellCount: 13,
    fineCellCount: 37
  } satisfies WaterFoamDetailTextureDescriptor);

export const WATER_FOAM_DETAIL_TEXTURE_RESOURCE_BYTES =
  Math.round(
    DEFAULT_WATER_FOAM_DETAIL_TEXTURE_DESCRIPTOR.size **
      2 *
      4 *
      (4 / 3)
  );

const textureCache = new WeakMap<Engine, Texture2D>();

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(
  minimum: number,
  maximum: number,
  value: number
): number {
  const ratio = clamp01(
    (value - minimum) /
      Math.max(maximum - minimum, 1e-8)
  );
  return ratio * ratio * (3 - ratio * 2);
}

function positiveModulo(
  value: number,
  divisor: number
): number {
  return ((value % divisor) + divisor) % divisor;
}

function smoothCurve(value: number): number {
  return value * value * (3 - value * 2);
}

function gridHash(
  x: number,
  y: number,
  seed: number
): number {
  let value =
    Math.imul(x + seed * 17, 0x45d9f3b) ^
    Math.imul(y + seed * 31, 0x119de1f3);
  value = Math.imul(
    value ^ (value >>> 16),
    0x45d9f3b
  );
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function periodicValueNoise(
  pixelX: number,
  pixelY: number,
  cellCount: number,
  seed: number,
  size: number
): number {
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
  const lower =
    gridHash(x0, y0, seed) * (1 - localX) +
    gridHash(x1, y0, seed) * localX;
  const upper =
    gridHash(x0, y1, seed) * (1 - localX) +
    gridHash(x1, y1, seed) * localX;
  return lower * (1 - localY) + upper * localY;
}

function validateDescriptor(
  descriptor: Readonly<WaterFoamDetailTextureDescriptor>
): Readonly<WaterFoamDetailTextureDescriptor> {
  const values = [
    descriptor.size,
    descriptor.seed,
    descriptor.broadCellCount,
    descriptor.mediumCellCount,
    descriptor.fineCellCount
  ];
  if (!values.every(Number.isFinite)) {
    throw new Error(
      "Water foam detail texture values must be finite."
    );
  }
  if (
    !values.every(Number.isSafeInteger) ||
    descriptor.size < 16 ||
    descriptor.size > 1024 ||
    descriptor.broadCellCount < 1 ||
    descriptor.mediumCellCount <=
      descriptor.broadCellCount ||
    descriptor.fineCellCount <=
      descriptor.mediumCellCount ||
    descriptor.fineCellCount > descriptor.size
  ) {
    throw new Error(
      "Water foam detail texture descriptor is outside its supported budget."
    );
  }
  return descriptor;
}

/**
 * R/G/B are independent thick, medium and light foam coverage fields.
 * The channels carry linear masks, not display color.
 */
export function buildWaterFoamDetailTexturePixels(
  descriptor: Readonly<WaterFoamDetailTextureDescriptor> = DEFAULT_WATER_FOAM_DETAIL_TEXTURE_DESCRIPTOR
): Uint8Array {
  const resolved = validateDescriptor(descriptor);
  const pixels = new Uint8Array(
    resolved.size * resolved.size * 4
  );
  for (let y = 0; y < resolved.size; y++) {
    for (let x = 0; x < resolved.size; x++) {
      const broad = periodicValueNoise(
        x,
        y,
        resolved.broadCellCount,
        resolved.seed,
        resolved.size
      );
      const medium = periodicValueNoise(
        x,
        y,
        resolved.mediumCellCount,
        resolved.seed + 101,
        resolved.size
      );
      const fine = periodicValueNoise(
        x,
        y,
        resolved.fineCellCount,
        resolved.seed + 307,
        resolved.size
      );
      const crossing = periodicValueNoise(
        x + resolved.size * 0.37,
        y - resolved.size * 0.21,
        resolved.mediumCellCount + 4,
        resolved.seed + 613,
        resolved.size
      );
      const mediumRidge =
        1 - Math.abs(medium * 2 - 1);
      const fineRidge = 1 - Math.abs(fine * 2 - 1);
      const thickCoverage = smoothstep(
        0.47,
        0.72,
        broad * 0.72 + mediumRidge * 0.28
      );
      const mediumCoverage = smoothstep(
        0.52,
        0.76,
        medium * 0.45 +
          crossing * 0.32 +
          fineRidge * 0.23
      );
      const lightCoverage = smoothstep(
        0.58,
        0.82,
        fine * 0.48 +
          crossing * 0.3 +
          broad * 0.22
      );
      const offset = (y * resolved.size + x) * 4;
      pixels[offset] = Math.round(
        thickCoverage * 255
      );
      pixels[offset + 1] = Math.round(
        mediumCoverage * 255
      );
      pixels[offset + 2] = Math.round(
        lightCoverage * 255
      );
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

/** One immutable repeatable linear mask texture per Engine. */
export function getWaterFoamDetailTexture(
  engine: Engine
): Texture2D {
  const existing = textureCache.get(engine);
  if (existing) return existing;
  const descriptor =
    DEFAULT_WATER_FOAM_DETAIL_TEXTURE_DESCRIPTOR;
  const texture = new Texture2D(
    engine,
    descriptor.size,
    descriptor.size,
    undefined,
    true,
    false
  );
  texture.name = "WaterFoamDetailShared";
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = texture.wrapModeV =
    TextureWrapMode.Repeat;
  texture.setPixelBuffer(
    buildWaterFoamDetailTexturePixels(descriptor)
  );
  texture.generateMipmaps();
  textureCache.set(engine, texture);
  return texture;
}
