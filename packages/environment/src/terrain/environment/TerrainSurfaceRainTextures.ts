import {
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  type Engine,
  type Scene
} from "@galacean/engine";
import {
  acquireSurfaceRainRippleNormalAtlas,
  type SurfaceRainRippleNormalAtlasLease
} from "../../weather/SurfaceRainRippleNormalAtlas";

const WATER_NORMAL_SIZE = 128;
const TAU = Math.PI * 2;
const IS_SRGB_COLOR_SPACE = false;

/** Scene-owned, linear-space normal resources used by the shared surface-climate Shader. */
export class TerrainSurfaceRainTextures {
  readonly rippleNormalAtlas: Texture2D;
  readonly waterNormal: Texture2D;
  private readonly _rippleNormalAtlasLease: SurfaceRainRippleNormalAtlasLease;
  private _destroyed = false;

  constructor(scene: Scene) {
    const rippleNormalAtlasLease = (this._rippleNormalAtlasLease = acquireSurfaceRainRippleNormalAtlas(scene));
    this.rippleNormalAtlas = rippleNormalAtlasLease.texture;
    try {
      this.waterNormal = createWaterNormal(scene.engine);
    } catch (error) {
      rippleNormalAtlasLease.release();
      throw error;
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    try {
      this.waterNormal.destroy();
    } finally {
      this._rippleNormalAtlasLease.release();
    }
  }
}

function createWaterNormal(engine: Engine): Texture2D {
  const texture = new Texture2D(
    engine,
    WATER_NORMAL_SIZE,
    WATER_NORMAL_SIZE,
    TextureFormat.R8G8B8A8,
    true,
    IS_SRGB_COLOR_SPACE
  );
  texture.name = "Terrain puddle water normal";
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;
  texture.anisoLevel = 2;
  texture.setPixelBuffer(buildWaterNormalPixels());
  texture.generateMipmaps();
  return texture;
}

function buildWaterNormalPixels(): Uint8Array {
  const pixels = new Uint8Array(WATER_NORMAL_SIZE * WATER_NORMAL_SIZE * 4);
  for (let y = 0; y < WATER_NORMAL_SIZE; y++) {
    const v = (y + 0.5) / WATER_NORMAL_SIZE;
    for (let x = 0; x < WATER_NORMAL_SIZE; x++) {
      const u = (x + 0.5) / WATER_NORMAL_SIZE;
      const phaseA = TAU * (u * 3 + v);
      const phaseB = TAU * (u * -2 + v * 4);
      const phaseC = TAU * (u * 5 - v * 3);
      const slopeX = Math.cos(phaseA) * 0.18 - Math.cos(phaseB) * 0.1 + Math.cos(phaseC) * 0.08;
      const slopeY = Math.cos(phaseA) * 0.06 + Math.cos(phaseB) * 0.2 - Math.cos(phaseC) * 0.05;
      writeNormal(pixels, (y * WATER_NORMAL_SIZE + x) * 4, -slopeX, -slopeY, 1);
    }
  }
  return pixels;
}

function writeNormal(pixels: Uint8Array, offset: number, x: number, y: number, z: number): void {
  const inverseLength = 1 / Math.sqrt(x * x + y * y + z * z);
  pixels[offset] = encodeNormalChannel(x * inverseLength);
  pixels[offset + 1] = encodeNormalChannel(y * inverseLength);
  pixels[offset + 2] = encodeNormalChannel(z * inverseLength);
  pixels[offset + 3] = 255;
}

function encodeNormalChannel(value: number): number {
  return Math.round((Math.min(Math.max(value, -1), 1) * 0.5 + 0.5) * 255);
}
