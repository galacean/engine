import {
  IPlatformRenderColorTexture,
  Logger,
  RenderBufferColorFormat,
  RenderColorTexture,
  TextureCubeFace
} from "@oasis-engine/core";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

export class GLRenderColorTexture extends GLTexture implements IPlatformRenderColorTexture {
  constructor(rhi: WebGLRenderer, texture: RenderColorTexture) {
    super(rhi, texture, texture._isCube ? rhi.gl.TEXTURE_CUBE_MAP : rhi.gl.TEXTURE_2D);

    const { _format, _mipmap, width, height, _isCube } = texture;

    const isWebGL2 = this._isWebGL2;

    if (!GLTexture._supportRenderBufferColorFormat(_format, rhi)) {
      throw new Error(`RenderBufferColorFormat is not supported:${RenderBufferColorFormat[_format]}`);
    }

    if (_isCube && width !== height) {
      throw new Error("The cube texture must have the same width and height");
    }

    if (_mipmap && !isWebGL2 && (!GLTexture._isPowerOf2(width) || !GLTexture._isPowerOf2(height))) {
      Logger.warn(
        "non-power-2 texture is not supported for mipmap in WebGL1,and has automatically downgraded to non-mipmap"
      );
      texture._mipmap = false;
    }

    this._formatDetail = GLTexture._getRenderBufferColorFormatDetail(_format, this._gl, isWebGL2);
    this._initMipmap(_isCube);
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
    super._getPixelBuffer(face, x, y, width, height, out);
  }
}
