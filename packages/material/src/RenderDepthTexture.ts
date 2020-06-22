import { RenderBufferDepthFormat, GLCapabilityType, AssetType, Logger } from "@alipay/o3-base";
import { Texture } from "./Texture";

/**
 * 类应用于渲染深度纹理。
 */
export class RenderDepthTexture extends Texture {
  /** @internal */
  public _isCube: boolean = false;

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
   * @param rhi - GPU 硬件抽象层 //CM:标注deprecated
   * @param width - 宽
   * @param height - 高
   * @param format - 格式。默认 RenderBufferDepthFormat.Depth,深度纹理,自动选择精度
   * @param mipmap - 是否使用多级纹理
   * @param isCube - 是否需要生成立方体纹理
   */
  constructor(
    rhi,
    width: number,
    height: number,
    format: RenderBufferDepthFormat = RenderBufferDepthFormat.Depth,
    mipmap: boolean = false,
    isCube: boolean = false
  ) {
    // todo: delete super
    super("", null);

    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;

    if (format === RenderBufferDepthFormat.Stencil) {
      throw new Error("WebGL can't generate stencil texture alone, you can bind it to an RBO"); //CM:提示要移除WebGL、RBO术语，要用引擎的结构表述
    }

    if (!rhi.canIUse(GLCapabilityType.depthTexture)) {
      throw new Error("depth texture is not supported"); //CM:最好输出是什么格式不支持
    }
    if ((format === RenderBufferDepthFormat.Depth24 || format === RenderBufferDepthFormat.Depth32) && !isWebGL2) {
      throw new Error("High precision depth texture is not supported");
    }
    if (format === RenderBufferDepthFormat.Depth32Stencil8 && !isWebGL2) {
      //CM:这个逻辑接上面并用else if更好
      throw new Error("High precision depth stencil texture is not supported");
    }
    if (isCube && width !== height) {
      throw new Error("The cube texture must have the same width and height");
    }
    if (mipmap && !isWebGL2 && (!Texture._isPowerOf2(width) || !Texture._isPowerOf2(height))) {
      Logger.warn(
        "non-power-2 texture is not supported for mipmap in WebGL1,and has automatically downgraded to non-mipmap"
      );
      mipmap = false;
    }

    const formatDetail = Texture._getRenderBufferDepthFormatDetail(format, gl, isWebGL2);

    //CM:现在Format有明确的类型枚举,这个不用加，我们内部应该维护好，不应该出现为null的情况
    if (!formatDetail) {
      throw new Error(`this format is not supported in Oasis Engine: ${format}`);
    }

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

    this._initMipmap(isCube);
    //todo: delete
    this.type = AssetType.Scene;
  }
}
