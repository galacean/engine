import { IPlatformTextureCube, TextureCube, TextureCubeFace } from "@galacean/engine-core";
import { GLTexture } from "./GLTexture";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

/**
 * Cube texture in WebGL platform.
 */
export class GLTextureCube extends GLTexture implements IPlatformTextureCube {
  /** Backward compatible with WebGL1.0. */
  private _compressedFaceFilled: number[] = [0, 0, 0, 0, 0, 0];

  constructor(rhi: WebGLGraphicDevice, textureCube: TextureCube) {
    super(rhi, textureCube, rhi.gl.TEXTURE_CUBE_MAP);

    this._validate(textureCube, rhi);

    const { format, isSRGBColorSpace } = textureCube;
    const isWebGL2 = this._isWebGL2;
    this._formatDetail = GLTexture._getFormatDetail(format, isSRGBColorSpace, this._gl, isWebGL2);
    (this._formatDetail.isCompressed && !isWebGL2) || this._init(true);
  }

  /**
   * {@inheritDoc IPlatformTextureCube.setPixelBuffer}
   */
  setPixelBuffer(
    face: TextureCubeFace,
    colorBuffer: ArrayBufferView,
    mipLevel: number,
    x: number,
    y: number,
    width?: number,
    height?: number
  ): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    const formatDetail = this._formatDetail;
    const { internalFormat, baseFormat, dataType, isCompressed } = formatDetail;
    const mipSize = Math.max(1, this._texture.width >> mipLevel);

    width = width || mipSize - x;
    height = height || mipSize - y;

    this._bind();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, formatDetail.alignment);

    if (isCompressed) {
      const mipBit = 1 << mipLevel;
      if (isWebGL2 || this._compressedFaceFilled[face] & mipBit) {
        gl.compressedTexSubImage2D(
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
          mipLevel,
          x,
          y,
          width,
          height,
          internalFormat,
          colorBuffer
        );
      } else {
        gl.compressedTexImage2D(
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
          mipLevel,
          internalFormat,
          width,
          height,
          0,
          colorBuffer
        );
        this._compressedFaceFilled[face] |= mipBit;
      }
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        mipLevel,
        x,
        y,
        width,
        height,
        baseFormat,
        dataType,
        colorBuffer
      );
    }
  }

  /**
   * {@inheritDoc IPlatformTextureCube.setImageSource}
   */
  setImageSource(
    face: TextureCubeFace,
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
    gl.texSubImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
      mipLevel,
      x || 0,
      y || 0,
      baseFormat,
      dataType,
      imageSource
    );
  }

  /**
   * {@inheritDoc IPlatformTextureCube.getPixelBuffer}
   */
  getPixelBuffer(
    face: TextureCubeFace,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): void {
    if (this._formatDetail.isCompressed) {
      throw new Error("Unable to read compressed texture");
    }
    super._getPixelBuffer(face, x, y, width, height, mipLevel, out);
  }
}
