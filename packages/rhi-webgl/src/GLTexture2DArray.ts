import { IPlatformTexture2DArray, Texture2DArray, TextureFormat } from "@oasis-engine/core";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * Texture 2D in WebGL platform.
 */
export class GLTexture2DArray extends GLTexture implements IPlatformTexture2DArray {
  constructor(rhi: WebGLRenderer, texture2DArray: Texture2DArray) {
    super(rhi, texture2DArray, (<WebGL2RenderingContext>rhi.gl).TEXTURE_2D_ARRAY);

    const { format, width, height, depth, mipmapCount } = texture2DArray;

    if (!this._isWebGL2) {
      throw new Error(`Texture2D Array is not supported in WebGL1.0`);
    }

    if (!GLTexture._supportTextureFormat(format, rhi)) {
      throw new Error(`Texture format is not supported:${TextureFormat[format]}`);
    }

    this._formatDetail = GLTexture._getFormatDetail(format, this._gl, true);
    this._gl.texStorage3D(this._target, mipmapCount, this._formatDetail.internalFormat, width, height, depth);
  }

  /**
   * {@inheritDoc IPlatformTexture2DArray.setPixelBuffer}
   */
  setPixelBuffer(
    elementIndex: number,
    colorBuffer: ArrayBufferView,
    mipLevel: number = 0,
    x: number = 0,
    y: number = 0,
    width?: number,
    height?: number
  ): void {
    const { _target: target, _gl: gl } = this;
    const { internalFormat, baseFormat, dataType, isCompressed } = this._formatDetail;

    width = width || Math.max(1, this._texture.width >> mipLevel) - x;
    height = height || Math.max(1, this._texture.height >> mipLevel) - y;

    this._bind();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

    if (isCompressed) {
      gl.compressedTexSubImage3D(target, mipLevel, x, y, elementIndex, width, height, 1, internalFormat, colorBuffer);
    } else {
      gl.texSubImage3D(target, mipLevel, x, y, elementIndex, width, height, 1, baseFormat, dataType, colorBuffer);
    }
  }

  /**
   * {@inheritDoc IPlatformTexture2DArray.setImageSource}
   */
  setImageSource(
    elementIndex: number,
    imageSource: TexImageSource,
    mipLevel: number = 0,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    x: number = 0,
    y: number = 0
  ): void {
    const gl = this._gl;
    const { baseFormat, dataType } = this._formatDetail;

    this._bind();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, +flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, +premultiplyAlpha);
    gl.texSubImage3D(
      this._target,
      mipLevel,
      x,
      y,
      elementIndex,
      imageSource.width,
      imageSource.height,
      1,
      baseFormat,
      dataType,
      imageSource
    );
  }

  /**
   * {@inheritDoc IPlatformTexture2DArray.getPixelBuffer}
   */
  getPixelBuffer(
    elementIndex: number,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): void {
    const { _gl: gl, _formatDetail: formatDetail } = this;

    if (formatDetail.isCompressed) {
      throw new Error("Unable to read compressed texture");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._getReadFrameBuffer());
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this._glTexture, mipLevel, elementIndex);
    gl.readPixels(x, y, width, height, formatDetail.baseFormat, formatDetail.dataType, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
