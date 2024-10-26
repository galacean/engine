import { IPlatformTexture2DArray, Texture2DArray, TextureFormat } from "@galacean/engine-core";
import { GLTexture } from "./GLTexture";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * Texture 2D array in WebGL platform.
 */
export class GLTexture2DArray extends GLTexture implements IPlatformTexture2DArray {
  constructor(rhi: WebGLGraphicDevice, texture2DArray: Texture2DArray) {
    super(rhi, texture2DArray, (<WebGL2RenderingContext>rhi.gl).TEXTURE_2D_ARRAY);

    const { format, width, height, length, mipmapCount } = texture2DArray;

    if (!this._isWebGL2) {
      throw new Error(`Texture2D Array is not supported in WebGL1.0`);
    }

    /** @ts-ignore */
    if (!GLTexture._supportTextureFormat(format, rhi)) {
      throw new Error(`Texture format is not supported:${TextureFormat[format]}`);
    }

    this._bind();
    this._formatDetail = GLTexture._getFormatDetail(format, this._gl, true);
    this._gl.texStorage3D(this._target, mipmapCount, this._formatDetail.internalFormat, width, height, length);
  }

  /**
   * {@inheritDoc IPlatformTexture2DArray.setPixelBuffer}
   */
  setPixelBuffer(
    offsetIndex: number,
    colorBuffer: ArrayBufferView,
    mipLevel: number,
    x: number,
    y: number,
    width?: number,
    height?: number,
    length?: number
  ): void {
    const { _target: target, _gl: gl } = this;
    const { internalFormat, baseFormat, dataType, isCompressed } = this._formatDetail;

    width = width || Math.max(1, this._texture.width >> mipLevel) - x;
    height = height || Math.max(1, this._texture.height >> mipLevel) - y;
    length = length || (<Texture2DArray>this._texture).length;

    this._bind();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

    if (isCompressed) {
      gl.compressedTexSubImage3D(
        target,
        mipLevel,
        x,
        y,
        offsetIndex,
        width,
        height,
        length,
        internalFormat,
        colorBuffer
      );
    } else {
      gl.texSubImage3D(target, mipLevel, x, y, offsetIndex, width, height, length, baseFormat, dataType, colorBuffer);
    }
  }

  /**
   * {@inheritDoc IPlatformTexture2DArray.setImageSource}
   */
  setImageSource(
    elementIndex: number,
    imageSource: TexImageSource,
    mipLevel: number,
    flipY: boolean,
    premultiplyAlpha: boolean,
    x: number,
    y: number
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
      (<Exclude<TexImageSource, VideoFrame>>imageSource).width ?? (<VideoFrame>imageSource).codedWidth,
      (<Exclude<TexImageSource, VideoFrame>>imageSource).height ?? (<VideoFrame>imageSource).codedHeight,
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
