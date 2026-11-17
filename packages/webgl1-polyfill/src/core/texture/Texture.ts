import {
  Texture,
  Logger,
  type Engine,
  TextureFormat,
  TextureUtils,
  type TextureDepthCompareFunction
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { Mixin, Overwrite, Shadow } from "@/override";

@Mixin(Texture)
export class TextureMixin {
  @Shadow declare _width: number;
  @Shadow declare _height: number;
  @Shadow declare _mipmap: boolean;
  @Shadow declare _mipmapCount: number;
  @Shadow declare _getMipmapCount: () => number;

  @Overwrite
  _initializeMipmaps(mipmap: boolean): void {
    if (mipmap && (!MathUtil.isPowerOf2(this._width) || !MathUtil.isPowerOf2(this._height))) {
      Logger.warn(
        "Non-power-2 texture is not supported for mipmap in WebGL1, and has automatically downgraded to non-mipmap"
      );
      mipmap = false;
    }
    this._mipmap = mipmap;
    this._mipmapCount = this._getMipmapCount();
  }

  @Overwrite
  static _supportsFormat(engine: Engine, format: TextureFormat, isSRGBColorSpace: boolean): boolean {
    const srgb =
      isSRGBColorSpace &&
      TextureUtils.supportSRGB(format) &&
      format !== TextureFormat.R8G8B8 &&
      format !== TextureFormat.R8G8B8A8;
    return engine._hardwareRenderer.supportsTextureFormat(format, srgb);
  }

  @Overwrite
  set depthCompareFunction(_value: TextureDepthCompareFunction) {
    Logger.warn("depthCompareFunction only support WebGL2");
  }
}
