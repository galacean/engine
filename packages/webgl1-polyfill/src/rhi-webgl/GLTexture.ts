import {
  GLCapabilityType,
  Logger,
  type Texture,
  type TextureCubeFace,
  type TextureDepthCompareFunction,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import type { WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";
import { textureFormat } from "./textureFormat";
import { Mixin, Overwrite, Shadow, callOriginal } from "@/override";
import { textureStorage } from "./textureStorage";

@Mixin("GLTexture")
export class GLTexture {
  @Shadow declare _formatDetail: { isCompressed: boolean };
  @Shadow declare _texture: Texture;

  @Overwrite
  setUseDepthCompareMode() {}
  @Overwrite
  static _supportRenderBufferColorFormat(format: TextureFormat, rhi: WebGLGraphicDevice) {
    return format !== TextureFormat.R11G11B10_UFloat && callOriginal(this, format, rhi);
  }
  @Overwrite
  static _supportRenderBufferDepthFormat(format: TextureFormat) {
    return ![TextureFormat.Depth24, TextureFormat.Depth32, TextureFormat.Depth32Stencil8].includes(format);
  }
  @Overwrite
  _init(cube: boolean) {
    if (!this._formatDetail.isCompressed) textureStorage.call(this, cube);
  }
  @Overwrite
  _validate(texture: Texture, rhi: WebGLGraphicDevice) {
    const pot = (width: number, height: number) => MathUtil.isPowerOf2(width) && MathUtil.isPowerOf2(height);
    callOriginal(this, texture, rhi);
    if (texture._mipmap && !pot(texture.width, texture.height)) {
      Logger.warn(
        "Non-power-2 texture is not supported for mipmap in WebGL1, and has automatically downgraded to non-mipmap"
      );
      texture._mipmap = false;
      texture["_mipmapCount"] = texture["_getMipmapCount"]();
    }
  }
  @Overwrite
  _setWrapMode(value: TextureWrapMode, pname: GLenum) {
    const pot = (width: number, height: number) => MathUtil.isPowerOf2(width) && MathUtil.isPowerOf2(height);
    if (value !== TextureWrapMode.Clamp && !pot(this._texture.width, this._texture.height)) {
      Logger.warn(
        "non-power-2 texture is not supported for REPEAT or MIRRORED_REPEAT in WebGL1,and has automatically downgraded to CLAMP_TO_EDGE"
      );
      value = TextureWrapMode.Clamp;
    }
    callOriginal(this, value, pname);
  }
  @Overwrite
  generateMipmaps() {
    if (this._texture._mipmap && this._texture.isSRGBColorSpace) {
      Logger.warn(
        "Auto-generating mipmaps for sRGB textures is only supported in [WebGL2 + R8G8B8A8], you must generate mipmaps manually."
      );
      return;
    }
    callOriginal(this);
  }
  @Overwrite
  _getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ) {
    if (mipLevel > 0) {
      mipLevel = 0;
      Logger.error("mipLevel only take effect in WebGL2.0");
    }
    callOriginal(this, face, x, y, width, height, mipLevel, out);
  }
  @Overwrite
  set depthCompareFunction(_value: TextureDepthCompareFunction) {}
  @Overwrite
  static _getFormatDetail(format: TextureFormat, srgb: boolean, gl: WebGLRenderingContext, rhi: WebGLGraphicDevice) {
    return (
      textureFormat(format, srgb && rhi.canIUse(GLCapabilityType.sRGB), gl, TextureFormat) ??
      callOriginal(this, format, srgb, gl, rhi)
    );
  }
  @Overwrite
  static _getRenderBufferDepthFormatDetail(format: TextureFormat, gl: WebGLRenderingContext, rhi: WebGLGraphicDevice) {
    return textureFormat(format, false, gl, TextureFormat, true) ?? callOriginal(this, format, gl, rhi);
  }
}
