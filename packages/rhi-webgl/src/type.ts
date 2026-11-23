export interface TextureFormatDetail {
  internalFormat: GLint;
  baseFormat?: GLenum;
  dataType?: GLenum;
  isCompressed: boolean;
  attachment?: GLenum;
  readFormat?: GLenum; // Read format are different in readPixels at some cases
  readType?: GLenum;
  alignment?: number; // Uncompressed texture data alignment
}

export { KTX1InternalFormat as GLCompressedTextureInternalFormat } from "@galacean/engine-design";
