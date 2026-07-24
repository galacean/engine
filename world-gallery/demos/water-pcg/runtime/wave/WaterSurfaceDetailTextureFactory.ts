/** Builds deterministic tileable slope/noise textures shared by water-surface shaders. */
import { Engine, Texture2D, TextureFilterMode, TextureWrapMode } from "@galacean/engine-core";
import { DEFAULT_WATER_SURFACE_DETAIL_TEXTURE_DESCRIPTOR } from "./constants/WaterSurfaceDetailTextureConstants";

export interface WaterSurfaceDetailTextureDescriptor {
  readonly size: number;
  readonly gradientStrength: number;
  readonly firstCellCount: number;
  readonly secondCellCount: number;
  readonly thirdCellCount: number;
  readonly firstWeight: number;
  readonly secondWeight: number;
  readonly thirdWeight: number;
  readonly firstSeed: number;
  readonly secondSeed: number;
  readonly thirdSeed: number;
  readonly auxiliarySeedOffset: number;
}

const cachedTextures = new WeakMap<Engine, Map<string, Texture2D>>();
const MAX_CACHED_DETAIL_TEXTURES_PER_ENGINE = 4;

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
  const bottom = gridHash(x0, y0, seed) * (1 - localX) + gridHash(x1, y0, seed) * localX;
  const top = gridHash(x0, y1, seed) * (1 - localX) + gridHash(x1, y1, seed) * localX;
  return bottom * (1 - localY) + top * localY;
}

function surfaceHeight(
  pixelX: number,
  pixelY: number,
  seedOffset: number,
  descriptor: Readonly<WaterSurfaceDetailTextureDescriptor>
): number {
  return (
    periodicValueNoise(
      pixelX,
      pixelY,
      descriptor.firstCellCount,
      descriptor.firstSeed + seedOffset,
      descriptor.size
    ) *
      descriptor.firstWeight +
    periodicValueNoise(
      pixelX,
      pixelY,
      descriptor.secondCellCount,
      descriptor.secondSeed + seedOffset,
      descriptor.size
    ) *
      descriptor.secondWeight +
    periodicValueNoise(
      pixelX,
      pixelY,
      descriptor.thirdCellCount,
      descriptor.thirdSeed + seedOffset,
      descriptor.size
    ) *
      descriptor.thirdWeight
  );
}

function encodeSigned(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value * 0.5 + 0.5)) * 255);
}

function descriptorKey(descriptor: Readonly<WaterSurfaceDetailTextureDescriptor>): string {
  return [
    descriptor.size,
    descriptor.gradientStrength,
    descriptor.firstCellCount,
    descriptor.secondCellCount,
    descriptor.thirdCellCount,
    descriptor.firstWeight,
    descriptor.secondWeight,
    descriptor.thirdWeight,
    descriptor.firstSeed,
    descriptor.secondSeed,
    descriptor.thirdSeed,
    descriptor.auxiliarySeedOffset
  ].join(":");
}

function validateDescriptor(
  descriptor: Readonly<WaterSurfaceDetailTextureDescriptor>
): Readonly<WaterSurfaceDetailTextureDescriptor> {
  const finiteValues = [
    descriptor.size,
    descriptor.gradientStrength,
    descriptor.firstCellCount,
    descriptor.secondCellCount,
    descriptor.thirdCellCount,
    descriptor.firstWeight,
    descriptor.secondWeight,
    descriptor.thirdWeight,
    descriptor.firstSeed,
    descriptor.secondSeed,
    descriptor.thirdSeed,
    descriptor.auxiliarySeedOffset
  ];
  if (!finiteValues.every(Number.isFinite)) {
    throw new Error("Water surface detail texture values must be finite.");
  }
  if (
    !Number.isInteger(descriptor.size) ||
    descriptor.size < 4 ||
    descriptor.size > 1024 ||
    !Number.isInteger(descriptor.firstCellCount) ||
    !Number.isInteger(descriptor.secondCellCount) ||
    !Number.isInteger(descriptor.thirdCellCount) ||
    descriptor.firstCellCount <= 0 ||
    descriptor.secondCellCount <= 0 ||
    descriptor.thirdCellCount <= 0 ||
    descriptor.firstCellCount > descriptor.size ||
    descriptor.secondCellCount > descriptor.size ||
    descriptor.thirdCellCount > descriptor.size ||
    descriptor.gradientStrength < 0 ||
    descriptor.firstWeight < 0 ||
    descriptor.secondWeight < 0 ||
    descriptor.thirdWeight < 0 ||
    descriptor.firstWeight + descriptor.secondWeight + descriptor.thirdWeight <= 0
  ) {
    throw new Error("Water surface detail texture descriptor is outside its supported budget.");
  }
  return descriptor;
}

/**
 * RG stores a periodic height-field gradient. B and A store two decorrelated scalar fields used
 * by foam and sparkle consumers. CPU generation keeps every shader consumer deterministic.
 */
export function buildWaterSurfaceDetailTexturePixels(
  descriptor: Readonly<WaterSurfaceDetailTextureDescriptor> = DEFAULT_WATER_SURFACE_DETAIL_TEXTURE_DESCRIPTOR
): Uint8Array {
  const resolved = validateDescriptor(descriptor);
  const pixels = new Uint8Array(resolved.size * resolved.size * 4);
  for (let y = 0; y < resolved.size; y++) {
    for (let x = 0; x < resolved.size; x++) {
      const slopeX =
        (surfaceHeight(x - 1, y, 0, resolved) - surfaceHeight(x + 1, y, 0, resolved)) *
        resolved.gradientStrength;
      const slopeY =
        (surfaceHeight(x, y - 1, 0, resolved) - surfaceHeight(x, y + 1, 0, resolved)) *
        resolved.gradientStrength;
      const offset = (y * resolved.size + x) * 4;
      pixels[offset] = encodeSigned(slopeX);
      pixels[offset + 1] = encodeSigned(slopeY);
      pixels[offset + 2] = Math.round(surfaceHeight(x, y, 0, resolved) * 255);
      pixels[offset + 3] = Math.round(
        surfaceHeight(x, y, resolved.auxiliarySeedOffset, resolved) * 255
      );
    }
  }
  return pixels;
}

/**
 * RG and BA store two decorrelated periodic slope fields. This is the native
 * Ocean packing: two independently advected cascades come from one linear
 * texture fetch without treating slope data as an sRGB PBR normal map.
 */
export function buildWaterSurfaceDualSlopeTexturePixels(
  descriptor: Readonly<WaterSurfaceDetailTextureDescriptor> = DEFAULT_WATER_SURFACE_DETAIL_TEXTURE_DESCRIPTOR
): Uint8Array {
  const resolved = validateDescriptor(descriptor);
  const pixels = new Uint8Array(
    resolved.size * resolved.size * 4
  );
  for (let y = 0; y < resolved.size; y++) {
    for (let x = 0; x < resolved.size; x++) {
      const primarySlopeX =
        (surfaceHeight(x - 1, y, 0, resolved) -
          surfaceHeight(x + 1, y, 0, resolved)) *
        resolved.gradientStrength;
      const primarySlopeY =
        (surfaceHeight(x, y - 1, 0, resolved) -
          surfaceHeight(x, y + 1, 0, resolved)) *
        resolved.gradientStrength;
      const secondarySlopeX =
        (surfaceHeight(
          x - 1,
          y,
          resolved.auxiliarySeedOffset,
          resolved
        ) -
          surfaceHeight(
            x + 1,
            y,
            resolved.auxiliarySeedOffset,
            resolved
          )) *
        resolved.gradientStrength;
      const secondarySlopeY =
        (surfaceHeight(
          x,
          y - 1,
          resolved.auxiliarySeedOffset,
          resolved
        ) -
          surfaceHeight(
            x,
            y + 1,
            resolved.auxiliarySeedOffset,
            resolved
          )) *
        resolved.gradientStrength;
      const offset = (y * resolved.size + x) * 4;
      pixels[offset] = encodeSigned(primarySlopeX);
      pixels[offset + 1] = encodeSigned(primarySlopeY);
      pixels[offset + 2] = encodeSigned(secondarySlopeX);
      pixels[offset + 3] = encodeSigned(secondarySlopeY);
    }
  }
  return pixels;
}

/** Returns one immutable, repeatable linear-space texture per Engine and descriptor. */
export function getWaterSurfaceDetailTexture(
  engine: Engine,
  descriptor: Readonly<WaterSurfaceDetailTextureDescriptor> = DEFAULT_WATER_SURFACE_DETAIL_TEXTURE_DESCRIPTOR
): Texture2D {
  const resolved = validateDescriptor(descriptor);
  let engineCache = cachedTextures.get(engine);
  if (!engineCache) {
    engineCache = new Map<string, Texture2D>();
    cachedTextures.set(engine, engineCache);
  }
  const key = descriptorKey(resolved);
  const existing = engineCache.get(key);
  if (existing) return existing;
  if (engineCache.size >= MAX_CACHED_DETAIL_TEXTURES_PER_ENGINE) {
    throw new Error(
      `Water surface detail texture cache exceeded ${MAX_CACHED_DETAIL_TEXTURES_PER_ENGINE} descriptors for one Engine.`
    );
  }

  const texture = new Texture2D(engine, resolved.size, resolved.size, undefined, true, false);
  texture.name = "WaterSurfaceDetailShared";
  // Materials are recreated during quality switches; the per-engine cache owns this immutable texture.
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(buildWaterSurfaceDetailTexturePixels(resolved));
  texture.generateMipmaps();
  engineCache.set(key, texture);
  return texture;
}

/** Returns the Ocean RG/BA dual-slope packing in linear color space. */
export function getWaterSurfaceDualSlopeTexture(
  engine: Engine,
  descriptor: Readonly<WaterSurfaceDetailTextureDescriptor> = DEFAULT_WATER_SURFACE_DETAIL_TEXTURE_DESCRIPTOR
): Texture2D {
  const resolved = validateDescriptor(descriptor);
  let engineCache = cachedTextures.get(engine);
  if (!engineCache) {
    engineCache = new Map<string, Texture2D>();
    cachedTextures.set(engine, engineCache);
  }
  const key = `dual-slope:${descriptorKey(resolved)}`;
  const existing = engineCache.get(key);
  if (existing) return existing;
  if (
    engineCache.size >=
    MAX_CACHED_DETAIL_TEXTURES_PER_ENGINE
  ) {
    throw new Error(
      `Water surface detail texture cache exceeded ${MAX_CACHED_DETAIL_TEXTURES_PER_ENGINE} descriptors for one Engine.`
    );
  }

  const texture = new Texture2D(
    engine,
    resolved.size,
    resolved.size,
    undefined,
    true,
    false
  );
  texture.name = "WaterSurfaceDualSlopeShared";
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = texture.wrapModeV =
    TextureWrapMode.Repeat;
  texture.setPixelBuffer(
    buildWaterSurfaceDualSlopeTexturePixels(resolved)
  );
  texture.generateMipmaps();
  engineCache.set(key, texture);
  return texture;
}
