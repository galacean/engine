import { RenderBufferColorFormat, GLCapabilityType, Logger } from "@alipay/o3-base";
import { Texture } from "./Texture";
import { TextureFormatDetail } from "./type";

/**
 * 类应用于渲染颜色纹理。
 */
export class RenderColorTexture extends Texture {
  private _format: RenderBufferColorFormat;
  private _autoMipmap: boolean = false;

  public _formatDetail: TextureFormatDetail;

  /**
   * 格式。
   */
  get format(): RenderBufferColorFormat {
    return this._format;
  }

  /**
   * 自动生成多级纹理。
   */
  get autoGenerateMipmaps(): boolean {
    return this._autoMipmap;
  }

  set autoGenerateMipmaps(value: boolean) {
    this._autoMipmap = value;
  }

  /**
   * 构造渲染纹理。
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param format - 格式，默认 RenderBufferColorFormat.R8G8B8A8
   * @param mipmap - 是否使用多级纹理
   */
  constructor(
    rhi,
    width: number,
    height: number,
    format: RenderBufferColorFormat = RenderBufferColorFormat.R8G8B8A8,
    mipmap: boolean = false
  ) {
    // todo: delete super
    super("", null);

    if (
      format === RenderBufferColorFormat.R32G32B32A32 &&
      (!rhi.canIUse(GLCapabilityType.colorBufferFloat) || !rhi.canIUse(GLCapabilityType.textureFloat))
    ) {
      Logger.error("当前环境不支持浮点纹理,请先检测能力再使用");
      return;
    }
    if (
      format === RenderBufferColorFormat.R16G16B16A16 &&
      (!rhi.canIUse(GLCapabilityType.colorBufferHalfFloat) || !rhi.canIUse(GLCapabilityType.textureHalfFloat))
    ) {
      Logger.error("当前环境不支持半浮点纹理,请先检测能力再使用");
      return;
    }
    if (mipmap && (!Texture.isPowerOf2(width) || !Texture.isPowerOf2(height))) {
      Logger.warn("非二次幂纹理不支持开启 mipmap,已自动降级为非mipmap");
      mipmap = false;
    }

    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;
    const formatDetail = Texture._getFormatDetail(format, gl, isWebGL2);
    const { internalFormat, baseFormat, dataType, isCompressed } = formatDetail;
    const glTexture = gl.createTexture();

    this._rhi = rhi;
    this._glTexture = glTexture;
    this._target = gl.TEXTURE_2D;
    this._width = width;
    this._height = height;
    this._mipmap = mipmap;
    this._format = format;
    this._formatDetail = formatDetail;

    // 预开辟 mipmap 显存
    if (mipmap) {
      this._bind();
      if (isWebGL2) {
        gl.texStorage2D(this._target, this.mipmapCount, internalFormat, width, height);
      } else {
        for (let i = 0; i < this.mipmapCount; i++) {
          gl.texImage2D(this._target, i, internalFormat, width, height, 0, baseFormat, dataType, null);
        }
      }
      this._unbind();
    }
  }
}
