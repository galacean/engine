import { IPlatformTexture2DArray, Texture2DArray } from "@galacean/engine-core";
import { GLTexture } from "./GLTexture";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * Texture 2D array in WebGL platform.
 */
export class GLTexture2DArray extends GLTexture implements IPlatformTexture2DArray {
  constructor(rhi: WebGLGraphicDevice, texture2DArray: Texture2DArray) {
    super(rhi, texture2DArray, rhi.gl.TEXTURE_2D_ARRAY);

    this._validate(texture2DArray);

    const { format, width, height, length, mipmapCount, isSRGBColorSpace } = texture2DArray;
    this._bind();
    this._formatDetail = GLTexture._getFormatDetail(format, isSRGBColorSpace, this._gl);
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
    const formatDetail = this._formatDetail;
    const { internalFormat, baseFormat, dataType, isCompressed } = formatDetail;

    width = width || Math.max(1, this._texture.width >> mipLevel) - x;
    height = height || Math.max(1, this._texture.height >> mipLevel) - y;
    length = length || (<Texture2DArray>this._texture).length;

    this._bind();

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
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, formatDetail.alignment!);
      gl.texSubImage3D(target, mipLevel, x, y, offsetIndex, width, height, length, baseFormat!, dataType!, colorBuffer);
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
      (<Exclude<TexImageSource, VideoFrame>>imageSource).width ?? (imageSource as unknown as VideoFrame).codedWidth,
      (<Exclude<TexImageSource, VideoFrame>>imageSource).height ?? (imageSource as unknown as VideoFrame).codedHeight,
      1,
      baseFormat!,
      dataType!,
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

    const readFormat = this._getReadFormat();
    gl.pixelStorei(gl.PACK_ALIGNMENT, formatDetail.alignment!);
    this._rhi._bindFramebuffer(gl.FRAMEBUFFER, this._getReadFrameBuffer());
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this._glTexture, mipLevel, elementIndex);
    gl.readPixels(x, y, width, height, readFormat, formatDetail.readType ?? formatDetail.dataType!, out);
    this._rhi._bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
