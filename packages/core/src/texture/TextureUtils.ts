import { TextureFormat } from "./enums/TextureFormat";

/**
 * @internal
 */
export class TextureUtils {
  static isHDRFormat(format: TextureFormat): boolean {
    return (
      format === TextureFormat.R16G16B16A16_SFloat ||
      format === TextureFormat.R32G32B32A32_SFloat ||
      format === TextureFormat.R11G11B10_UFloat
    );
  }

  static supportSRGB(format: TextureFormat) {
    switch (format) {
      case TextureFormat.R8G8B8_UNorm:
      case TextureFormat.R8G8B8A8_UNorm:
      case TextureFormat.BC1:
      case TextureFormat.BC3:
      case TextureFormat.BC7:
      case TextureFormat.ETC2_RGB:
      case TextureFormat.ETC2_RGBA8:
      case TextureFormat.ASTC_4x4:
      case TextureFormat.ASTC_5x5:
      case TextureFormat.ASTC_6x6:
      case TextureFormat.ASTC_8x8:
      case TextureFormat.ASTC_10x10:
      case TextureFormat.ASTC_12x12:
      case TextureFormat.ETC2_RGBA5:
        return true;
      default:
        return false;
    }
  }

  static getTextureByteCount(
    format: TextureFormat,
    width: number,
    height: number,
    mipmapCount: number,
    faceCount: number
  ): number {
    let totalBytes = 0;
    for (let i = 0; i < mipmapCount; i++) {
      const mipWidth = Math.max(1, width >> i);
      const mipHeight = Math.max(1, height >> i);
      totalBytes += TextureUtils.getMipLevelByteCount(format, mipWidth, mipHeight);
    }
    return totalBytes * faceCount;
  }

  static getMipLevelByteCount(format: TextureFormat, width: number, height: number): number {
    switch (format) {
      // Uncompressed formats
      case TextureFormat.R8_UNorm:
        return width * height;
      case TextureFormat.R8G8_UNorm:
      case TextureFormat.R16_UNorm:
      case TextureFormat.R16_SFloat:
        return width * height * 2;
      case TextureFormat.R8G8B8_UNorm:
        return width * height * 3;
      case TextureFormat.R8G8B8A8_UNorm:
      case TextureFormat.R11G11B10_UFloat:
      case TextureFormat.R16G16_SFloat:
      case TextureFormat.R32_SFloat:
        return width * height * 4;
      case TextureFormat.R4G4B4A4_UNorm:
      case TextureFormat.R5G5B5A1_UNorm:
      case TextureFormat.R5G6B5_UNorm:
        return width * height * 2;
      case TextureFormat.R16G16B16A16_SFloat:
      case TextureFormat.R32G32_SFloat:
        return width * height * 8;
      case TextureFormat.R32G32B32A32_SFloat:
      case TextureFormat.R32G32B32A32_UInt:
        return width * height * 16;

      // BC compressed (4x4 blocks)
      case TextureFormat.BC1:
        return Math.ceil(width / 4) * Math.ceil(height / 4) * 8;
      case TextureFormat.BC3:
      case TextureFormat.BC7:
      case TextureFormat.BC6H:
        return Math.ceil(width / 4) * Math.ceil(height / 4) * 16;

      // ETC compressed (4x4 blocks)
      case TextureFormat.ETC1_RGB:
      case TextureFormat.ETC2_RGB:
      case TextureFormat.ETC2_RGBA5:
        return Math.ceil(width / 4) * Math.ceil(height / 4) * 8;
      case TextureFormat.ETC2_RGBA8:
        return Math.ceil(width / 4) * Math.ceil(height / 4) * 16;

      // PVRTC compressed
      case TextureFormat.PVRTC_RGB2:
      case TextureFormat.PVRTC_RGBA2:
        return (Math.max(width, 16) * Math.max(height, 8) * 2) / 8;
      case TextureFormat.PVRTC_RGB4:
      case TextureFormat.PVRTC_RGBA4:
        return (Math.max(width, 8) * Math.max(height, 8) * 4) / 8;

      // ASTC compressed (16 bytes per block)
      case TextureFormat.ASTC_4x4:
        return Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
      case TextureFormat.ASTC_5x5:
        return Math.ceil(width / 5) * Math.ceil(height / 5) * 16;
      case TextureFormat.ASTC_6x6:
        return Math.ceil(width / 6) * Math.ceil(height / 6) * 16;
      case TextureFormat.ASTC_8x8:
        return Math.ceil(width / 8) * Math.ceil(height / 8) * 16;
      case TextureFormat.ASTC_10x10:
        return Math.ceil(width / 10) * Math.ceil(height / 10) * 16;
      case TextureFormat.ASTC_12x12:
        return Math.ceil(width / 12) * Math.ceil(height / 12) * 16;

      // Depth / stencil formats
      case TextureFormat.Depth16:
        return width * height * 2;
      case TextureFormat.Depth24:
      case TextureFormat.Depth24Stencil8:
      case TextureFormat.Depth32:
        return width * height * 4;
      case TextureFormat.Depth32Stencil8:
        return width * height * 8;

      // STENCIL_INDEX8: 1 byte per pixel
      case TextureFormat.Stencil:
        return width * height;

      // Auto depth/stencil (conservative estimate)
      case TextureFormat.Depth:
      case TextureFormat.DepthStencil:
        return width * height * 4;

      default:
        return width * height * 4;
    }
  }
}
