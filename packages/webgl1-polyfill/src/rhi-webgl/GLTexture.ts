import { GLCapabilityType, type TextureDepthCompareFunction, TextureFormat } from "@galacean/engine-core";
import type { WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";
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
  _allocateCompressedMip(
    target: number,
    mipLevel: number,
    width: number,
    height: number,
    data: ArrayBufferView
  ): boolean {
    let targets = allocatedMips.get(this);
    if (!targets) allocatedMips.set(this, (targets = new Map()));

    const levels = targets.get(target) ?? 0;
    const bit = 1 << mipLevel;
    if (levels & bit) return false;

    this._gl.compressedTexImage2D(target, mipLevel, this._formatDetail.internalFormat, width, height, 0, data);
    targets.set(target, levels | bit);
    return true;
  }

  @Overwrite
  set depthCompareFunction(_value: TextureDepthCompareFunction) {}

  @Overwrite
  static _getPlatformFormat(
    format: TextureFormat,
    srgb: boolean,
    gl: WebGLRenderingContext,
    rhi: WebGLGraphicDevice,
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
        if (!rhi.requireExtension(WebGL1Extension.textureHalfFloat)) return null;
        break;
      case TextureFormat.R32G32B32A32:
        if (!rhi.requireExtension(WebGL1Extension.textureFloat)) return null;
        break;
      case TextureFormat.Depth16:
      case TextureFormat.Depth24Stencil8:
      case TextureFormat.Depth:
      case TextureFormat.DepthStencil:
        if (!rhi.requireExtension(WebGL1Extension.depthTexture)) return null;
        break;
    }
    const useSRGB = srgb && rhi.canIUse(GLCapabilityType.sRGBTexture);
    return textureFormat(format, useSRGB, gl, TextureFormat);
  }
}
