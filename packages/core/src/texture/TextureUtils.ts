import { MathUtil } from "@galacean/engine-math";
import { TextureFormat } from "./enums/TextureFormat";

/**
 * @internal
 */
export class TextureUtils {
  /**
   * Check if the texture config supports auto mipmap generation with real correction for mipmap and isSRGBColorSpace.
   */
  static supportGenerateMipmapsWithCorrection(
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGBColorSpace: boolean,
    isWebGL2: boolean
  ): boolean {
    if (!mipmap) {
      return false;
    }

    if (isSRGBColorSpace && !TextureUtils.supportSRGB(format)) {
      isSRGBColorSpace = false;
    }

    if (!TextureUtils.supportMipmaps(width, height, isWebGL2)) {
      mipmap = false;
    }

    return TextureUtils.supportGenerateMipmaps(format, mipmap, isSRGBColorSpace, isWebGL2);
  }

  static supportSRGB(format: TextureFormat) {
    switch (format) {
      case TextureFormat.R8G8B8:
      case TextureFormat.R8G8B8A8:
      case TextureFormat.BC1:
      case TextureFormat.BC3:
      case TextureFormat.BC7:
      case TextureFormat.ETC2_RGB:
      case TextureFormat.ETC2_RGBA8:
      case TextureFormat.ASTC_4x4:
        return true;
      default:
        return false;
    }
  }

  static supportMipmaps(width: number, height, isWebGL2: boolean): boolean {
    return isWebGL2 || (MathUtil.isPowerOf2(width) && MathUtil.isPowerOf2(height));
  }

  static supportGenerateMipmaps(
    format: TextureFormat,
    mipmap: boolean,
    isSRGBColorSpace: boolean,
    isWebGL2: boolean
  ): boolean {
    // Auto generating mipmaps for sRGB textures is only supported in [WebGL2 + RGBA]
    if (mipmap && isSRGBColorSpace && !(isWebGL2 && format === TextureFormat.R8G8B8A8)) {
      return false;
    }

    return true;
  }
}
