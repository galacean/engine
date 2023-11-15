import { TextureFormat } from "@galacean/engine-core";
import { GLCompressedTextureInternalFormat } from "@galacean/engine-rhi-webgl";

export type CompressedTextureData = {
  internalFormat: GLCompressedTextureInternalFormat;
  width: number;
  height: number;
  mipmaps: Mipmap[];
  engineFormat: TextureFormat;
};

export type CompressedCubeData = {
  engineFormat: TextureFormat;
  internalFormat: number;
  width: number;
  height: number;
  mipmapsFaces: Mipmap[][];
};

export type Mipmap = {
  data: ArrayBufferView;
  width: number;
  height: number;
};

export type KTXContainer = {
  /**
   * origin buffer data
   */
  buffer: ArrayBuffer;
  /**
   * Gets the openGL type
   */
  glType: number;
  /**
   * Gets the openGL type size
   */
  glTypeSize: number;
  /**
   * Gets the openGL format
   */
  glFormat: number;
  /**
   * Gets the openGL internal format
   */
  glInternalFormat: number;
  /**
   * Gets the base internal format
   */
  glBaseInternalFormat: GLCompressedTextureInternalFormat;
  /**
   * Gets image width in pixel
   */
  pixelWidth: number;
  /**
   * Gets image height in pixel
   */
  pixelHeight: number;
  /**
   * Gets image depth in pixels
   */
  pixelDepth: number;
  /**
   * Gets the number of array elements
   */
  numberOfArrayElements: number;
  /**
   * Gets the number of faces
   */
  numberOfFaces: number;
  /**
   * Gets the number of mipmap levels
   */
  numberOfMipmapLevels: number;
  /**
   * Gets the bytes of key value data
   */
  bytesOfKeyValueData: number;
  /**
   * Gets the load type
   */
  loadType: number;
  /**
   * parsed mipmap data
   */
  mipmaps?: Mipmap[];
  /**
   * Galacean Engine native TextureFormat
   */
  engineFormat?: TextureFormat;
};
