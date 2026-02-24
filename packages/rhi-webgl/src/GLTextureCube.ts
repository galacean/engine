import { IPlatformTextureCube, TextureCube, TextureCubeFace } from "@galacean/engine-core";
import { GLTexture } from "./GLTexture";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";

interface IExternalCubeTextureOptions {
  size?: number;
  mipmapCount?: number;
  ownedByEngine?: boolean;
  immutable?: boolean;
}

interface IWebGL2CubeTextureQueryContext extends WebGL2RenderingContext {
  getTexLevelParameter(target: number, level: number, pname: number): number;
}

/**
 * Cube texture in WebGL platform.
 */
export class GLTextureCube extends GLTexture implements IPlatformTextureCube {
  /** Backward compatible with WebGL1.0. */
  private _compressedFaceFilled: number[] = [0, 0, 0, 0, 0, 0];
  private _externalTextureImmutable: boolean = true;

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
    if (this._isExternalTexture && this._externalTextureImmutable) {
      throw new Error("Cannot upload pixel data to an immutable external cube texture.");
    }

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
    if (this._isExternalTexture && this._externalTextureImmutable) {
      throw new Error("Cannot upload image data to an immutable external cube texture.");
    }

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

  /**
   * @internal
   */
  _bindExternalTexture(handle: unknown, options?: IExternalCubeTextureOptions): void {
    const externalTexture = handle as WebGLTexture;
    if (!externalTexture) {
      throw new Error("External cube texture handle is invalid.");
    }

    if (this._glTexture === externalTexture && this._isExternalTexture) {
      this._externalTextureImmutable = options?.immutable ?? true;
      this._syncExternalTextureMeta(options);
      return;
    }

    this._ownsGLTexture && this._glTexture && this._gl.deleteTexture(this._glTexture);

    this._glTexture = externalTexture;
    this._isExternalTexture = true;
    this._ownsGLTexture = options?.ownedByEngine ?? false;
    this._externalTextureImmutable = options?.immutable ?? true;
    this._syncExternalTextureMeta(options);
    this._applyTextureState();
    this._invalidateTextureBindingCache();
  }

  /**
   * @internal
   */
  _unbindExternalTexture(): void {
    if (!this._isExternalTexture) {
      return;
    }

    this._ownsGLTexture && this._glTexture && this._gl.deleteTexture(this._glTexture);

    this._glTexture = this._gl.createTexture();
    this._isExternalTexture = false;
    this._ownsGLTexture = true;
    this._externalTextureImmutable = true;
    this._compressedFaceFilled.fill(0);
    (this._formatDetail.isCompressed && !this._isWebGL2) || this._init(true);
    this._applyTextureState();
    this._invalidateTextureBindingCache();
  }

  /**
   * @internal
   */
  _isExternalTextureBound(): boolean {
    return this._isExternalTexture;
  }

  private _applyTextureState(): void {
    const texture = this._texture as any;
    this.wrapModeU = texture._wrapModeU;
    this.wrapModeV = texture._wrapModeV;
    this.filterMode = texture._filterMode;
    this.anisoLevel = texture._anisoLevel;
  }

  private _syncExternalTextureMeta(options?: IExternalCubeTextureOptions): void {
    let size = options?.size ?? 0;
    let mipmapCount = options?.mipmapCount ?? 0;

    if (this._isWebGL2 && (size <= 0 || mipmapCount <= 0)) {
      const gl = this._gl as IWebGL2CubeTextureQueryContext;
      const currentBinding = gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP) as WebGLTexture | null;
      const textureWidth = 0x1000;
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this._glTexture);
      try {
        if (size <= 0) {
          size = gl.getTexLevelParameter(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, textureWidth) || 0;
        }
        if (mipmapCount <= 0 && size > 0) {
          for (let level = 0; level < 16; level++) {
            const levelSize = gl.getTexLevelParameter(gl.TEXTURE_CUBE_MAP_POSITIVE_X, level, textureWidth) || 0;
            if (levelSize <= 0) {
              break;
            }
            mipmapCount++;
            if (levelSize === 1) {
              break;
            }
          }
        }
      } finally {
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, currentBinding);
      }
    }

    const texture = this._texture as any;
    size = Math.max(size || texture._width || 1, 1);
    mipmapCount = Math.max(mipmapCount || texture._mipmapCount || 1, 1);
    texture._width = size;
    texture._height = size;
    texture._mipmap = mipmapCount > 1;
    texture._mipmapCount = mipmapCount;
  }
}
