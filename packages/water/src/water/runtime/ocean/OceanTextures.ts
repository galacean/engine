import { type Texture, Texture2D, TextureFormat, TextureUtils } from "@galacean/engine-core";
import {
  WATER_MATERIAL_TEXTURE_SLOTS,
  validateWaterMaterialTextureMetadata
} from "../../native/WaterMaterialTextureSlots";

export interface OceanTextures {
  readonly smoothWaves: Texture2D | null;
  readonly roughWaves: Texture2D | null;
  readonly caustics: Texture2D | null;
  readonly foam: Texture2D | null;
  readonly intersectionNoise: Texture2D | null;
  readonly textureCount: number;
  readonly containerFormat: "native";
  readonly compressedTextureCount: number;
  readonly uncompressedFallbackTextureCount: number;
  readonly resourceBytes: number;
}

/** Borrow native project textures. The Material and render materials retain their own references. */
export function describeOceanTextures(resources: readonly (Texture | null)[]): Readonly<OceanTextures> {
  if (resources.length !== 5) throw new Error("Ocean requires five native Texture2D slots (null is allowed).");
  resources.forEach((texture, index) => {
    if (texture === null) return;
    const slot = WATER_MATERIAL_TEXTURE_SLOTS.ocean[index];
    if (!(texture instanceof Texture2D) || texture.destroyed)
      throw new TypeError(`Water texture '${slot.slot}' requires a live Texture2D.`);
    validateWaterMaterialTextureMetadata(slot, texture);
  });
  const [smoothWaves, roughWaves, caustics, foam, intersectionNoise] = resources as (Texture2D | null)[];
  const present = [...new Set(resources.filter((texture): texture is Texture2D => texture !== null))];
  return Object.freeze({
    smoothWaves,
    roughWaves,
    caustics,
    foam,
    intersectionNoise,
    textureCount: present.length,
    containerFormat: "native",
    compressedTextureCount: present.filter((texture) => isOceanTextureCompressedFormat(texture.format)).length,
    uncompressedFallbackTextureCount: present.filter((texture) => !isOceanTextureCompressedFormat(texture.format))
      .length,
    resourceBytes: present.reduce((bytes, texture) => bytes + computeOceanTextureResourceBytes(texture), 0)
  });
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
