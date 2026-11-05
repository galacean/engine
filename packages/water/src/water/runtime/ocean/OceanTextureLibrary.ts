import {
  type Engine,
  type Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureUtils,
  TextureWrapMode
} from "@galacean/engine-core";

import { loadBuiltinWaterTexture } from "../../native/WaterBuiltinAssets";

export interface OceanTextures {
  readonly smoothWaves: Texture2D;
  readonly roughWaves: Texture2D;
  readonly caustics: Texture2D;
  readonly foam: Texture2D;
  readonly intersectionNoise: Texture2D;
  readonly textureCount: 5;
  readonly containerFormat: "ktx2";
  readonly compressedTextureCount: number;
  readonly uncompressedFallbackTextureCount: number;
  readonly resourceBytes: number;
}

/** Borrow native project textures. The Material and render materials retain their own references. */
export function describeOceanTextures(resources: readonly Texture2D[]): Readonly<OceanTextures> {
  if (resources.length !== 5) throw new Error("Ocean requires five native Texture2D slots.");
  for (const [index, texture] of resources.entries()) {
    if (texture.destroyed || texture.isSRGBColorSpace !== index >= 2)
      throw new Error(`Ocean texture slot ${index} has an invalid color space.`);
    if (texture.mipmapCount !== Math.floor(Math.log2(Math.max(texture.width, texture.height))) + 1)
      throw new Error(`Ocean texture slot ${index} requires a complete mip chain.`);
  }
  const [smoothWaves, roughWaves, caustics, foam, intersectionNoise] = resources;
  return Object.freeze({
    smoothWaves,
    roughWaves,
    caustics,
    foam,
    intersectionNoise,
    textureCount: 5,
    containerFormat: "ktx2",
    compressedTextureCount: resources.filter((texture) => isOceanTextureCompressedFormat(texture.format)).length,
    uncompressedFallbackTextureCount: resources.filter((texture) => !isOceanTextureCompressedFormat(texture.format))
      .length,
    resourceBytes: resources.reduce((bytes, texture) => bytes + computeOceanTextureResourceBytes(texture), 0)
  });
}

async function loadTexture(
  engine: Engine,
  url: string,
  name: string,
  isSRGBColorSpace: boolean,
  anisoLevel: number
): Promise<Texture2D> {
  let texture: Texture2D | undefined;
  try {
    texture = await loadBuiltinWaterTexture(engine, url);
    const expectedMipmapCount = Math.floor(Math.log2(Math.max(texture.width, texture.height))) + 1;
    if (texture.isSRGBColorSpace !== isSRGBColorSpace) {
      throw new Error(
        `Ocean KTX2 '${name}' has ${texture.isSRGBColorSpace ? "sRGB" : "linear"} transfer; expected ${
          isSRGBColorSpace ? "sRGB" : "linear"
        }.`
      );
    }
    if (texture.mipmapCount !== expectedMipmapCount) {
      throw new Error(
        `Ocean KTX2 '${name}' has ${texture.mipmapCount} mip levels; expected complete chain ${expectedMipmapCount}.`
      );
    }
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
    texture.filterMode = TextureFilterMode.Trilinear;
    texture.anisoLevel = anisoLevel;
    texture.name = name;
    return texture;
  } catch (error) {
    if (texture) releaseTexture(texture);
    throw error;
  }
}

export function computeOceanTextureResourceBytes(
  texture: Pick<Texture2D, "format" | "width" | "height" | "mipmapCount">
): number {
  return TextureUtils.getTextureByteCount(texture.format, texture.width, texture.height, texture.mipmapCount, 1);
}

export function isOceanTextureCompressedFormat(format: TextureFormat): boolean {
  return (
    format === TextureFormat.BC1 ||
    format === TextureFormat.BC3 ||
    format === TextureFormat.BC7 ||
    format === TextureFormat.ETC1_RGB ||
    format === TextureFormat.ETC2_RGB ||
    format === TextureFormat.ETC2_RGBA5 ||
    format === TextureFormat.ETC2_RGBA8 ||
    format === TextureFormat.PVRTC_RGB2 ||
    format === TextureFormat.PVRTC_RGBA2 ||
    format === TextureFormat.PVRTC_RGB4 ||
    format === TextureFormat.PVRTC_RGBA4 ||
    format === TextureFormat.ASTC_4x4 ||
    format === TextureFormat.ASTC_5x5 ||
    format === TextureFormat.ASTC_6x6 ||
    format === TextureFormat.ASTC_8x8 ||
    format === TextureFormat.ASTC_10x10 ||
    format === TextureFormat.ASTC_12x12
  );
}

/** Page-owned, immutable texture bundle for the sole Ocean Look. */
export class OceanTextureLibrary {
  readonly textures: Readonly<OceanTextures>;
  private _destroyed = false;

  private constructor(private readonly _resources: readonly Texture2D[]) {
    const [smoothWaves, roughWaves, caustics, foam, intersectionNoise] = _resources;
    this.textures = Object.freeze({
      smoothWaves: smoothWaves!,
      roughWaves: roughWaves!,
      caustics: caustics!,
      foam: foam!,
      intersectionNoise: intersectionNoise!,
      textureCount: 5 as const,
      containerFormat: "ktx2" as const,
      compressedTextureCount: _resources.filter((texture) => isOceanTextureCompressedFormat(texture.format)).length,
      uncompressedFallbackTextureCount: _resources.filter((texture) => !isOceanTextureCompressedFormat(texture.format))
        .length,
      resourceBytes: _resources.reduce((bytes, texture) => bytes + computeOceanTextureResourceBytes(texture), 0)
    });
  }

  static async create(engine: Engine): Promise<OceanTextureLibrary> {
    const requests = [
      loadTexture(engine, "Water/Textures/ocean-smoothWaves.ktx2", "Ocean SmoothWaves", false, 4),
      loadTexture(engine, "Water/Textures/ocean-roughWaves.ktx2", "Ocean RoughWaves", false, 4),
      loadTexture(engine, "Water/Textures/ocean-caustics.ktx2", "Ocean Caustics_1", true, 2),
      loadTexture(engine, "Water/Textures/ocean-foam.ktx2", "Ocean Foam1", true, 2),
      loadTexture(engine, "Water/Textures/ocean-intersectionNoise.ktx2", "Ocean IntersectionNoise", true, 2)
    ] as const;
    const settled = await Promise.allSettled(requests);
    const resources = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const rejected = settled.find((result) => result.status === "rejected");
    if (rejected) {
      for (const resource of resources) releaseTexture(resource);
      throw rejected.reason;
    }
    return new OceanTextureLibrary(resources);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const resource of this._resources) releaseTexture(resource);
  }
}

// ResourceManager may return the same cached texture to several Scene owners.
function retainTexture(texture: Texture2D, delta: number): void {
  (texture as unknown as { _addReferCount(delta: number): void })._addReferCount(delta);
}
function releaseTexture(texture: Texture2D): void {
  if (texture.destroyed) return;
  retainTexture(texture, -1);
  texture.destroy();
}
