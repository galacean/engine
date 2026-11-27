/** Shared per-Engine 128x128 R8 periodic Voronoi F1 texture replacing per-pixel 3-octave shore ALU. */
import {
  Engine,
  SystemInfo,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { registerWaterContentRestorer } from "../resources/WaterContentRestorer";

export const WATER_ANIMATED_VORONOI_TEXTURE_PROPERTY = "material_AppearanceV2VoronoiTexture";
export const WATER_ANIMATED_VORONOI_TEXTURE_SIZE = 128;
export const WATER_ANIMATED_VORONOI_TILE_CELLS = 8;
/** Seamless clock wrap period (seconds); shader UV velocities are exact multiples of 1 / 64. */
export const WATER_ANIMATED_VORONOI_CLOCK_PERIOD = 64;

const sharedTextures = new WeakMap<Engine, Texture2D>();
let cachedR8Pixels: Uint8Array | undefined;
let cachedRgba8Pixels: Uint8Array | undefined;

function fract(value: number): number {
  return value - Math.floor(value);
}

function voronoiHash(cx: number, cy: number): readonly [number, number] {
  const hx = fract(Math.sin(cx * 127.1 + cy * 311.7) * 43758.5453);
  const hy = fract(Math.sin(cx * 269.5 + cy * 183.3) * 43758.5453);
  return [hx, hy];
}

/**
 * Generates a tileable periodic F1 Voronoi distance map in [0, 255].
 * Uses the same 0.707 * sqrt(f1) normalization as the former procedural shader so
 * existing authored opacity/exponent/range presets keep matching foam response.
 */
export function generatePeriodicVoronoiF1Pixels(
  size = WATER_ANIMATED_VORONOI_TEXTURE_SIZE,
  tileCells = WATER_ANIMATED_VORONOI_TILE_CELLS
): Uint8Array {
  const pixels = new Uint8Array(size * size);
  const featureX = new Float32Array(tileCells * tileCells);
  const featureY = new Float32Array(tileCells * tileCells);
  for (let cy = 0; cy < tileCells; cy++) {
    for (let cx = 0; cx < tileCells; cx++) {
      const [ox, oy] = voronoiHash(cx, cy);
      const idx = cy * tileCells + cx;
      featureX[idx] = ox;
      featureY[idx] = oy;
    }
  }

  for (let y = 0; y < size; y++) {
    const py = ((y + 0.5) / size) * tileCells;
    const cellY = Math.floor(py);
    const localY = py - cellY;
    for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * tileCells;
      const cellX = Math.floor(px);
      const localX = px - cellX;
      let minDistSq = 1e9;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = (((cellY + oy) % tileCells) + tileCells) % tileCells;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = (((cellX + ox) % tileCells) + tileCells) % tileCells;
          const idx = ny * tileCells + nx;
          const dx = localX - ox - featureX[idx];
          const dy = localY - oy - featureY[idx];
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistSq) minDistSq = distSq;
        }
      }
      const f1 = Math.min(1, Math.max(0, 0.707 * Math.sqrt(minDistSq)));
      pixels[y * size + x] = Math.round(f1 * 255);
    }
  }
  return pixels;
}

function getVoronoiPixelBuffer(useR8: boolean): Uint8Array {
  const r8 = (cachedR8Pixels ??= generatePeriodicVoronoiF1Pixels());
  if (useR8) return r8;
  if (!cachedRgba8Pixels) {
    const rgba = new Uint8Array(r8.length * 4);
    for (let i = 0; i < r8.length; i++) {
      const v = r8[i];
      const o = i * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
    cachedRgba8Pixels = rgba;
  }
  return cachedRgba8Pixels;
}

/** Returns the Engine-scoped shared 128x128 R8 periodic Voronoi F1 texture (with RGBA8 fallback if R8 is unavailable). */
export function getSharedWaterAnimatedVoronoiTexture(engine: Engine): Texture2D {
  const existing = sharedTextures.get(engine);
  if (existing && !existing.destroyed) return existing;

  const useR8 = SystemInfo.supportsTextureFormat(engine, TextureFormat.R8_UNorm);
  const format = useR8 ? TextureFormat.R8_UNorm : TextureFormat.R8G8B8A8_UNorm;
  const pixels = getVoronoiPixelBuffer(useR8);
  const texture = new Texture2D(
    engine,
    WATER_ANIMATED_VORONOI_TEXTURE_SIZE,
    WATER_ANIMATED_VORONOI_TEXTURE_SIZE,
    format,
    true,
    false
  );
  texture.name = "WaterAnimatedVoronoiF1";
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(pixels);
  texture.generateMipmaps();
  registerWaterContentRestorer(engine, texture, () => {
    texture.setPixelBuffer(pixels);
    texture.generateMipmaps();
  });
  sharedTextures.set(engine, texture);
  return texture;
}
