import type { TextureFormat } from "@galacean/engine-core";
interface TextureFormatDetail {
  internalFormat: number;
  baseFormat?: number;
  dataType?: number;
  isCompressed: boolean;
  attachment?: number;
  readFormat?: number;
  alignment?: number;
}

/** Resolve the WebGL1 storage format without changing the public texture format. */
export function textureFormat(
  format: TextureFormat,
  isSRGBColorSpace: boolean,
  gl: WebGLRenderingContext,
  types: typeof TextureFormat,
  renderbuffer = false
): TextureFormatDetail | undefined {
  const { SRGB8, SRGB8_ALPHA8, HALF_FLOAT, UNSIGNED_INT_24_8 } = gl as WebGLRenderingContext &
    Record<"SRGB8" | "SRGB8_ALPHA8" | "HALF_FLOAT" | "UNSIGNED_INT_24_8", number>;
  switch (format) {
    case types.R8G8B8:
      return {
        internalFormat: isSRGBColorSpace ? SRGB8 : gl.RGB,
        baseFormat: isSRGBColorSpace ? SRGB8 : gl.RGB,
        readFormat: gl.RGB,
        dataType: gl.UNSIGNED_BYTE,
        isCompressed: false,
        alignment: 1
      };
    case types.R8G8B8A8:
      return {
        internalFormat: isSRGBColorSpace ? SRGB8_ALPHA8 : gl.RGBA,
        baseFormat: isSRGBColorSpace ? SRGB8_ALPHA8 : gl.RGBA,
        readFormat: gl.RGBA,
        dataType: gl.UNSIGNED_BYTE,
        isCompressed: false,
        alignment: 4
      };
    case types.R4G4B4A4:
      return {
        internalFormat: gl.RGBA,
        baseFormat: gl.RGBA,
        dataType: gl.UNSIGNED_SHORT_4_4_4_4,
        isCompressed: false,
        alignment: 2
      };
    case types.R5G5B5A1:
      return {
        internalFormat: gl.RGBA,
        baseFormat: gl.RGBA,
        dataType: gl.UNSIGNED_SHORT_5_5_5_1,
        isCompressed: false,
        alignment: 2
      };
    case types.R5G6B5:
      return {
        internalFormat: gl.RGB,
        baseFormat: gl.RGB,
        dataType: gl.UNSIGNED_SHORT_5_6_5,
        isCompressed: false,
        alignment: 2
      };
    case types.R16G16B16A16:
      return {
        internalFormat: gl.RGBA,
        baseFormat: gl.RGBA,
        dataType: HALF_FLOAT,
        isCompressed: false,
        alignment: 8
      };
    case types.R32G32B32A32:
      return {
        internalFormat: gl.RGBA,
        baseFormat: gl.RGBA,
        dataType: gl.FLOAT,
        isCompressed: false,
        alignment: 8
      };
    case types.Depth:
      return {
        internalFormat: renderbuffer ? gl.DEPTH_COMPONENT16 : gl.DEPTH_COMPONENT,
        baseFormat: gl.DEPTH_COMPONENT,
        dataType: gl.UNSIGNED_SHORT,
        isCompressed: false,
        attachment: gl.DEPTH_ATTACHMENT
      };
    case types.DepthStencil:
      return {
        internalFormat: gl.DEPTH_STENCIL,
        baseFormat: gl.DEPTH_STENCIL,
        dataType: UNSIGNED_INT_24_8,
        isCompressed: false,
        attachment: gl.DEPTH_STENCIL_ATTACHMENT
      };
    case types.Depth16:
      return {
        internalFormat: renderbuffer ? gl.DEPTH_COMPONENT16 : gl.DEPTH_COMPONENT,
        baseFormat: gl.DEPTH_COMPONENT,
        dataType: gl.UNSIGNED_SHORT,
        isCompressed: false,
        attachment: gl.DEPTH_ATTACHMENT
      };
    case types.Depth24Stencil8:
      return {
        internalFormat: gl.DEPTH_STENCIL,
        baseFormat: gl.DEPTH_STENCIL,
        dataType: UNSIGNED_INT_24_8,
        isCompressed: false,
        attachment: gl.DEPTH_STENCIL_ATTACHMENT
      };
  }
}
