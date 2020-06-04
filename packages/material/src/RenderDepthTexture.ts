import { RenderBufferDepthFormat, GLCapabilityType, Logger } from "@alipay/o3-base";
import { Texture } from "./Texture";

/**
 * 类应用于渲染深度纹理。
 */
export class RenderDepthTexture extends Texture {
  private _format: RenderBufferDepthFormat;
  private _autoMipmap: boolean = false;

  /**
   * 格式。
   */
  get format(): RenderBufferDepthFormat {
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
   * 构造渲染深度纹理。
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param format - 格式。默认 RenderBufferDepthFormat.Depth,深度纹理,自动选择精度
   * @param mipmap - 是否使用多级纹理
   */
  constructor(
    rhi,
    width: number,
    height: number,
    format: RenderBufferDepthFormat = RenderBufferDepthFormat.Depth,
    mipmap: boolean = false
  ) {
    // todo: delete super
    super("", null);

    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;

    if (format !== RenderBufferDepthFormat.Stencil && !rhi.canIUse(GLCapabilityType.depthTexture)) {
      Logger.error("当前环境不支持生成深度相关的纹理,请先检测能力再使用");
      return;
    }
    if ((format === RenderBufferDepthFormat.Depth24 || format === RenderBufferDepthFormat.Depth32) && !isWebGL2) {
      Logger.error("当前环境不支持高精度深度纹理,请先检测能力再使用");
      return;
    }
    if (format === RenderBufferDepthFormat.Depth32Stencil8 && !isWebGL2) {
      Logger.error("当前环境不支持高精度深度模版纹理,请先检测能力再使用");
      return;
    }
    if (mipmap && (!Texture.isPowerOf2(width) || !Texture.isPowerOf2(height))) {
      Logger.warn("非二次幂纹理不支持开启 mipmap,已自动降级为非mipmap");
      mipmap = false;
    }

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
