import { Engine } from "../Engine";
import { IPlatformRenderColorTexture } from "../renderingHardwareInterface";
import { RenderBufferColorFormat } from "./enums/RenderBufferColorFormat";
import { TextureCubeFace } from "./enums/TextureCubeFace";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture } from "./Texture";

/**
 * 类应用于渲染颜色纹理。
 */
export class RenderColorTexture extends Texture {
  _isCube: boolean = false;
  _format: RenderBufferColorFormat;
  _platformTexture: IPlatformRenderColorTexture;

  /**
   * @internal
   */
  private _autoMipmap: boolean = false;

  /**
   * 格式。
   */
  get format(): RenderBufferColorFormat {
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
   * 构造渲染纹理。
   * @param engine - 所属引擎
   * @param width - 宽
   * @param height - 高
   * @param format - 格式，默认 RenderBufferColorFormat.R8G8B8A8
   * @param mipmap - 是否使用多级纹理
   * @param isCube - 是否为立方体模式
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    format: RenderBufferColorFormat = RenderBufferColorFormat.R8G8B8A8,
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

    this._platformTexture = engine._hardwareRenderer.createPlatformRenderColorTexture(this);

    this.filterMode = TextureFilterMode.Bilinear;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Clamp;
  }

  /**
   * 根据立方体面和指定区域获得颜色像素缓冲。
   * @param face - 如果是立方体纹理，可以选择读取第几个面;立方体纹理读取面，isCube=true时生效
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色像素缓冲
   */
  public getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): void {
    this._platformTexture.getPixelBuffer(face, x, y, width, height, out);
  }
}
