import { IPlatformTextureCube, Logger, TextureCube, TextureCubeFace, TextureFormat } from "@galacean/engine-core";
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

    /** @ts-ignore */
    const { format, _mipmap, width: size } = textureCube;
    const isWebGL2 = this._isWebGL2;

    /** @ts-ignore */
    if (!GLTexture._supportTextureFormat(format, rhi)) {
      throw new Error(`Texture format is not supported:${TextureFormat[format]}`);
    }

    if (_mipmap && !isWebGL2 && !GLTexture._isPowerOf2(size)) {
      Logger.warn(
        "non-power-2 texture is not supported for mipmap in WebGL1,and has automatically downgraded to non-mipmap"
      );

      /** @ts-ignore */
      textureCube._mipmap = false;
      /** @ts-ignore */
      textureCube._mipmapCount = textureCube._getMipmapCount();
    }

    this._formatDetail = GLTexture._getFormatDetail(format, this._gl, isWebGL2);
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
    const { internalFormat, baseFormat, dataType, isCompressed } = this._formatDetail;
    const mipSize = Math.max(1, this._texture.width >> mipLevel);

    width = width || mipSize - x;
    height = height || mipSize - y;

    this._bind();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

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
