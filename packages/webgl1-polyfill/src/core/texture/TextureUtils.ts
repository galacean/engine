import { type Engine, TextureFormat, TextureUtils } from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { Mixin, Overwrite } from "@/override";

@Mixin(TextureUtils)
export class TextureUtilsMixin {
  @Overwrite
  static supportGenerateMipmapsWithCorrection(
    _engine: Engine,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGBColorSpace: boolean
  ): boolean {
    return (
      mipmap &&
      MathUtil.isPowerOf2(width) &&
      MathUtil.isPowerOf2(height) &&
      (!isSRGBColorSpace || !TextureUtils.supportSRGB(format))
    );
  }
}
