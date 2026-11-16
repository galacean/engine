import { type TextureDepthCompareFunction, TextureFormat } from "@galacean/engine-core";
import type { WebGL1GraphicDevice } from "./GLCapability";
import { Mixin, Overwrite, Shadow } from "@/override";
import { textureFormat } from "./textureFormat";
import { textureStorage } from "./textureStorage";
import { WebGL1Extension } from "./WebGL1Extension";

const allocatedMips = new WeakMap<GLTexture, Map<number, number>>();

@Mixin("GLTexture")
export class GLTexture {
  @Shadow declare _formatDetail: { isCompressed: boolean; internalFormat: number };
  @Shadow declare _gl: WebGLRenderingContext;

  @Overwrite
  setUseDepthCompareMode() {}

  @Overwrite
  _init(cube: boolean) {
    if (!this._formatDetail.isCompressed) textureStorage.call(this, cube);
  }

  @Overwrite
  _uploadCompressedPixels(
    target: number,
    mipLevel: number,
    x: number,
    y: number,
    width: number,
    height: number,
    data: ArrayBufferView
  ): void {
    let targets = allocatedMips.get(this);
    if (!targets) allocatedMips.set(this, (targets = new Map()));

    const levels = targets.get(target) ?? 0;
    const bit = 1 << mipLevel;
    const { internalFormat } = this._formatDetail;
    if (levels & bit) {
      this._gl.compressedTexSubImage2D(target, mipLevel, x, y, width, height, internalFormat, data);
    } else {
      this._gl.compressedTexImage2D(target, mipLevel, internalFormat, width, height, 0, data);
      targets.set(target, levels | bit);
    }
  }

  @Overwrite
  set depthCompareFunction(_value: TextureDepthCompareFunction) {}

  @Overwrite
  static _getPlatformFormat(
    format: TextureFormat,
    srgb: boolean,
    gl: WebGLRenderingContext,
    rhi: WebGL1GraphicDevice,
    renderbuffer: boolean
  ): ReturnType<typeof textureFormat> | null {
    if (renderbuffer) {
      if (
        format === TextureFormat.Depth24 ||
        format === TextureFormat.Depth32 ||
        format === TextureFormat.Depth32Stencil8
      ) {
        return null;
      }
      return textureFormat(format, false, gl, TextureFormat, true);
    }

    switch (format) {
      case TextureFormat.R11G11B10_UFloat:
      case TextureFormat.R32G32B32A32_UInt:
      case TextureFormat.Depth24:
      case TextureFormat.Depth32:
      case TextureFormat.Depth32Stencil8:
      case TextureFormat.R8:
      case TextureFormat.R8G8:
        return null;
      case TextureFormat.R16G16B16A16:
        if (!rhi.canIUse(WebGL1Extension.textureHalfFloat)) return null;
        break;
      case TextureFormat.R32G32B32A32:
        if (!rhi.canIUse(WebGL1Extension.textureFloat)) return null;
        break;
      case TextureFormat.Depth16:
      case TextureFormat.Depth24Stencil8:
      case TextureFormat.Depth:
      case TextureFormat.DepthStencil:
        if (!rhi.canIUse(WebGL1Extension.depthTexture)) return null;
        break;
    }
    const useSRGB = srgb && rhi.canIUse(WebGL1Extension.sRGB);
    return textureFormat(format, useSRGB, gl, TextureFormat);
  }
}
