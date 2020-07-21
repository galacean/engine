import { RenderBufferDepthFormat, TextureFilterMode, TextureWrapMode, AssetType, Logger } from "@alipay/o3-base";
import { Texture } from "./Texture";
import { Engine } from "@alipay/o3-core";

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
   * 是否自动生成多级纹理。
   */
  get autoGenerateMipmaps(): boolean {
    return this._autoMipmap;
  }

  set autoGenerateMipmaps(value: boolean) {
    this._autoMipmap = value;
  }

  /**
   * 构造渲染深度纹理。
   * @param width - 宽
   * @param height - 高
   * @param format - 格式。默认 RenderBufferDepthFormat.Depth,深度纹理,自动选择精度
   * @param mipmap - 是否使用多级纹理
   * @param isCube - 是否为立方体模式
   * @param engine - 可选引擎
   */
  constructor(
    width: number,
    height: number,
    format: RenderBufferDepthFormat = RenderBufferDepthFormat.Depth,
    mipmap: boolean = false,
    isCube: boolean = false,
    engine?: Engine
  ) {
    super();
    engine = engine || Engine._getDefaultEngine();
    const rhi = engine.hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;

    if (!Texture._supportRenderBufferDepthFormat(format, rhi, true)) {
      throw new Error(`RenderBufferDepthFormat is not supported:${RenderBufferDepthFormat[format]}`);
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

    this._glTexture = gl.createTexture();
    this._formatDetail = Texture._getRenderBufferDepthFormatDetail(format, gl, isWebGL2);
    this._isCube = isCube;
    this._rhi = rhi;
    this._target = isCube ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
    this._mipmap = mipmap;
    this._width = width;
    this._height = height;
    this._format = format;
    this._mipmapCount = this._getMipmapCount();

    this._initMipmap(isCube);

    this.filterMode = TextureFilterMode.Bilinear;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Clamp;
  }
}
