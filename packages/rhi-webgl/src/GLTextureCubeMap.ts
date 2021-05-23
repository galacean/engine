import { IPlatformTextureCubeMap, Logger, TextureCubeFace, TextureCubeMap, TextureFormat } from "@oasis-engine/core";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * Cube texture in WebGL platform.
 */
export class GLTextureCubeMap extends GLTexture implements IPlatformTextureCubeMap {
  /**
   * Backward compatible with WebGL1.0.。
   */
  private _compressedFaceFilled: number[] = [0, 0, 0, 0, 0, 0];

  /**
   * Create cube texture in WebGL platform.
   */
  constructor(rhi: WebGLRenderer, textureCube: TextureCubeMap) {
    super(rhi, textureCube, rhi.gl.TEXTURE_CUBE_MAP);

    /** @ts-ignore */
    const { format, _mipmap, width: size } = textureCube;
    const isWebGL2 = this._isWebGL2;

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
    (this._formatDetail.isCompressed && !isWebGL2) || this._initMipmap(true);
  }

  /**
   * Setting pixels data through cube face,color buffer data, designated area and texture mipmapping level,it's also applicable to compressed formats.
   * @remarks When compressed texture is in WebGL1, the texture must be filled first before writing the sub-region
   * @param face - Cube face
   * @param colorBuffer - Color buffer data
   * @param mipLevel - Texture mipmapping level
   * @param x - X coordinate of area start
   * @param y -  Y coordinate of area start
   * @param width - Data width.if it's empty, width is the width corresponding to mipLevel minus x , width corresponding to mipLevel is Math.max(1, this.width >> mipLevel)
   * @param height - Data height.if it's empty, height is the height corresponding to mipLevel minus y , height corresponding to mipLevel is Math.max(1, this.height >> mipLevel)
   */
  setPixelBuffer(
    face: TextureCubeFace,
    colorBuffer: ArrayBufferView,
    mipLevel: number = 0,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    const { internalFormat, baseFormat, dataType, isCompressed } = this._formatDetail;
    const mipSize = Math.max(1, this._texture.width >> mipLevel);

    x = x || 0;
    y = y || 0;
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
   * Setting pixels data through cube face, TexImageSource, designated area and texture mipmapping level.
   * @param face - Cube face
   * @param imageSource - The source of texture
   * @param mipLevel - Texture mipmapping level
   * @param flipY - Whether to flip the Y axis
   * @param premultipltAlpha - Whether to premultiply the transparent channel
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   */
  setImageSource(
    face: TextureCubeFace,
    imageSource: TexImageSource,
    mipLevel: number = 0,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    x?: number,
    y?: number
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
   * Get the pixel color buffer according to the specified cube face and area.
   * @param face - You can choose which cube face to read
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param out - Color buffer
   * @param mipLevel - Set mip level the data want to get from
   */
  getPixelBuffer(
    face: TextureCubeFace,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView,
    mipLevel: number
  ): void {
    if (this._formatDetail.isCompressed) {
      throw new Error("Unable to read compressed texture");
    }
    super._getPixelBuffer(face, x, y, width, height, out, mipLevel);
  }
}
