import { type Engine, type TextureFormat, TextureUtils as CoreTextureUtils } from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { Mixin, Overwrite } from "@/override";

@Mixin("TextureUtils")
export class TextureUtils {
  @Overwrite
  static supportGenerateMipmapsWithCorrection(
    _engine: Engine,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    srgb: boolean
  ) {
    const pot = (width: number, height: number) => MathUtil.isPowerOf2(width) && MathUtil.isPowerOf2(height);
    if (!mipmap) return false;
    if (srgb && !CoreTextureUtils.supportSRGB(format)) srgb = false;
    if (!pot(width, height)) mipmap = false;
    return !(mipmap && srgb);
  }
}
