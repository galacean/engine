import { TextureCubeFace, RenderBufferColorFormat, GLCapabilityType, AssetType, Logger } from "@alipay/o3-base";
import { Texture } from "./Texture";

/**
 * 类应用于渲染颜色纹理。
 */
export class RenderColorTexture extends Texture {
  /** @internal */
  public _isCube: boolean = false;

  private _format: RenderBufferColorFormat;
  private _autoMipmap: boolean = false;

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
   * @param rhi - GPU 硬件抽象层 //CM:标注deprecated
   * @param width - 宽
   * @param height - 高
   * @param format - 格式，默认 RenderBufferColorFormat.R8G8B8A8
   * @param mipmap - 是否使用多级纹理
   * @param isCube - 是否需要生成立方体纹理
   */
  constructor(
    rhi,
    width: number,
    height: number,
    format: RenderBufferColorFormat = RenderBufferColorFormat.R8G8B8A8,
    mipmap: boolean = false,
    isCube: boolean = false
  ) {
    // todo: delete super
    super("", null);

    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;

    //CM:写成更通用的判断
    if (
      format === RenderBufferColorFormat.R32G32B32A32 &&
      (!rhi.canIUse(GLCapabilityType.colorBufferFloat) || !rhi.canIUse(GLCapabilityType.textureFloat))
    ) {
      throw new Error("Float Color Buffer is not supported");
    }
    if (
      //CM:写成更通用的判断，可以和上面的合并
      format === RenderBufferColorFormat.R16G16B16A16 &&
      (!rhi.canIUse(GLCapabilityType.colorBufferHalfFloat) || !rhi.canIUse(GLCapabilityType.textureHalfFloat))
    ) {
      throw new Error("Half Float Color Buffer is not supported");
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

    const formatDetail = Texture._getRenderBufferColorFormatDetail(format, gl, isWebGL2);

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

  /**
   * 根据指定区域获得像素颜色缓冲
   * @param face - 如果是立方体纹理，可以选择读取第几个面//CM:立方体纹理读取面，isCube=true时生效
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色数据缓冲
   */
  public getPixelsBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): void {
    super._getPixelsBuffer(face, x, y, width, height, out);
  }
}
