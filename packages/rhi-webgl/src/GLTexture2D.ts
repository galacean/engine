import { IPlatformTexture2D, Texture2D, TextureUsage } from "@galacean/engine-core";
import { GLTexture } from "./GLTexture";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * Texture 2d in WebGL platform.
 */
export class GLTexture2D extends GLTexture implements IPlatformTexture2D {
  constructor(rhi: WebGLGraphicDevice, texture2D: Texture2D) {
    super(rhi, texture2D, rhi.gl.TEXTURE_2D);

    this._validate(texture2D);

    const { format, isSRGBColorSpace } = texture2D;
    this._formatDetail = GLTexture._getFormatDetail(format, isSRGBColorSpace, this._gl);
    this._init(false);
  }

  /**
   * {@inheritDoc IPlatformTexture2D.setPixelBuffer}
   */
  setPixelBuffer(
    colorBuffer: ArrayBufferView,
    mipLevel: number = 0,
    x: number,
    y: number,
    width?: number,
    height?: number
  ): void {
    const gl = this._gl;

    const formatDetail = this._formatDetail;
    const mipWidth = Math.max(1, this._texture.width >> mipLevel);
    const mipHeight = Math.max(1, this._texture.height >> mipLevel);

    width = width || mipWidth - x;
    height = height || mipHeight - y;

    this._bind();

    if (formatDetail.isCompressed) {
      gl.compressedTexSubImage2D(this._target, mipLevel, x, y, width, height, formatDetail.internalFormat, colorBuffer);
    } else {
      const { baseFormat, dataType } = formatDetail;
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, formatDetail.alignment!);
      gl.texSubImage2D(this._target, mipLevel, x, y, width, height, baseFormat!, dataType!, colorBuffer);
    }
  }

  /**
   * {@inheritDoc IPlatformTexture2D.setImageSource}
   */
  setImageSource(
    imageSource: TexImageSource,
    mipLevel: number,
    flipY: boolean,
    premultiplyAlpha: boolean,
    x: number,
    y: number
  ): void {
    const gl = this._gl;
    const { internalFormat, baseFormat, dataType } = this._formatDetail;

    this._bind();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, +flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, +premultiplyAlpha);

    if (this._texture.usage === TextureUsage.Dynamic) {
      gl.texImage2D(this._target, mipLevel, internalFormat, baseFormat!, dataType!, imageSource);
    } else {
      gl.texSubImage2D(this._target, mipLevel, x || 0, y || 0, baseFormat!, dataType!, imageSource);
    }
  }

  /**
   * {@inheritDoc IPlatformTexture2D.getPixelBuffer }
   */
  getPixelBuffer(x: number, y: number, width: number, height: number, mipLevel: number, out: ArrayBufferView): void {
    if (this._formatDetail.isCompressed) {
      throw new Error("Unable to read compressed texture");
    }
    super._getPixelBuffer(null, x, y, width, height, mipLevel, out);
  }
}
