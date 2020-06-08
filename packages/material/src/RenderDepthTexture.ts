import { TextureCubeFace, RenderBufferDepthFormat, GLCapabilityType, Logger } from "@alipay/o3-base";
import { Texture } from "./Texture";

/**
 * 类应用于渲染深度纹理。
 */
export class RenderDepthTexture extends Texture {
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

  private _format: RenderBufferDepthFormat;
  private _autoMipmap: boolean = false;

  /**
   * 构造渲染深度纹理。
   * @param rhi - GPU 硬件抽象层
   * @param width - 宽
   * @param height - 高
   * @param format - 格式。默认 RenderBufferDepthFormat.Depth,深度纹理,自动选择精度
   * @param isCube - 是否需要生成立方体纹理
   * @param mipmap - 是否使用多级纹理
   */
  constructor(
    rhi,
    width: number,
    height: number,
    format: RenderBufferDepthFormat = RenderBufferDepthFormat.Depth,
    isCube: boolean = false,
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
    if (isCube && width !== height) {
      Logger.error("立方体纹理的宽高必须一致");
      return;
    }
    if (mipmap && (!Texture._isPowerOf2(width) || !Texture._isPowerOf2(height))) {
      Logger.warn("非二次幂纹理不支持开启 mipmap,已自动降级为非mipmap");
      mipmap = false;
    }

    const formatDetail = Texture._getFormatDetail(format, gl, isWebGL2);
    const glTexture = gl.createTexture();

    this._glTexture = glTexture;
    this._formatDetail = formatDetail;
    this._isCube = isCube;
    this._rhi = rhi;
    this._target = isCube ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
    this._mipmap = mipmap;
    this._width = width;
    this._height = height;
    this._format = format;

  }

  /**
   * 根据指定区域获得像素颜色缓冲
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色数据缓冲
   * @param face - 如果是立方体纹理，可以选择读取第几个面
   */
  public getPixelsBuffer(
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView,
    face?: TextureCubeFace
  ): void {
    super._getPixelsBuffer(x, y, width, height, out, face);
    this._initMipmap();
  }
}
