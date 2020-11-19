import { Engine } from "../Engine";
import { IPlatformRenderDepthTexture } from "../renderingHardwareInterface";
import { RenderBufferDepthFormat } from "./enums/RenderBufferDepthFormat";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture } from "./Texture";

/**
 * 类应用于渲染深度纹理。
 */
export class RenderDepthTexture extends Texture {
  _isCube: boolean = false;
  _format: RenderBufferDepthFormat;
  _platformTexture: IPlatformRenderDepthTexture;

  /** @internal */
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
   * @param engine - 所属引擎
   * @param width - 宽
   * @param height - 高
   * @param format - 格式。默认 RenderBufferDepthFormat.Depth,深度纹理,自动选择精度
   * @param mipmap - 是否使用多级纹理
   * @param isCube - 是否为立方体模式
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    format: RenderBufferDepthFormat = RenderBufferDepthFormat.Depth,
    mipmap: boolean = false,
    isCube: boolean = false
  ) {
    super(engine);

    this._isCube = isCube;
    this._mipmap = mipmap;
    this._width = width;
    this._height = height;
    this._format = format;
    this._mipmapCount = this._getMipmapCount();

    this._platformTexture = engine._hardwareRenderer.createPlatformRenderDepthTexture(this);

    this.filterMode = TextureFilterMode.Bilinear;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Clamp;
  }
}
