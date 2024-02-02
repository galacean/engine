/**
 * Texture format enumeration.
 */
export enum TextureFormat {
  /** RGB format, 8 bits per channel. */
  R8G8B8,
  /** RGBA format, 8 bits per channel. */
  R8G8B8A8,
  /** RGBA format, 4 bits per channel. */
  R4G4B4A4,
  /** RGBA format, 5 bits in R channel, 5 bits in G channel, 5 bits in B channel, 1 bit in A channel. */
  R5G5B5A1,
  /** RGB format, 5 bits in R channel, 6 bits in G channel, 5 bits in B channel. */
  R5G6B5,
  /** Transparent format, 8 bits. */
  Alpha8,
  /** Luminance/alpha in RGB channel, alpha in A channel. */
  LuminanceAlpha,
  /** RGBA format, 16 bits per channel. */
  R16G16B16A16,
  /** RGBA format, 32 bits per channel. */
  R32G32B32A32,
  /** RGBA unsigned integer format, 32 bits per channel. */
  R32G32B32A32_UInt,

  /** RGB compressed format, 4 bits per pixel. */
  BC1,
  /** RGBA compressed format, 8 bits per pixel. */
  BC3,
  /** RGB(A) compressed format, 128 bits per 4x4 pixel block. */
  BC7,
  /** RGB compressed format, 4 bits per pixel. */
  ETC1_RGB,
  /** RGB compressed format, 4 bits per pixel. */
  ETC2_RGB,
  /** RGBA compressed format, 5 bits per pixel, 4 bit in RGB, 1 bit in A. */
  ETC2_RGBA5,
  /** RGB compressed format, 8 bits per pixel. */
  ETC2_RGBA8,
  /** RGB compressed format, 2 bits per pixel. */
  PVRTC_RGB2,
  /** RGBA compressed format, 2 bits per pixel. */
  PVRTC_RGBA2,
  /** RGB compressed format, 4 bits per pixel. */
  PVRTC_RGB4,
  /** RGBA compressed format, 4 bits per pixel. */
  PVRTC_RGBA4,
  /** RGB(A) compressed format, 128 bits per 4x4 pixel block. */
  ASTC_4x4,
  /** RGB(A) compressed format, 128 bits per 5x5 pixel block. */
  ASTC_5x5,
  /** RGB(A) compressed format, 128 bits per 6x6 pixel block. */
  ASTC_6x6,
  /** RGB(A) compressed format, 128 bits per 8x8 pixel block. */
  ASTC_8x8,
  /** RGB(A) compressed format, 128 bits per 10x10 pixel block. */
  ASTC_10x10,
  /** RGB(A) compressed format, 128 bits per 12x12 pixel block. */
  ASTC_12x12,

  /** Automatic depth format, engine will automatically select the supported precision. */
  Depth,
  /** Automatic depth stencil format, engine will automatically select the supported precision. */
  DepthStencil,
  /** 16-bit depth format. */
  Depth16,
  /** 24-bit depth format. */
  Depth24,
  /** 32-bit depth format. */
  Depth32,
  /** 16-bit depth + 8-bit stencil format. */
  Depth24Stencil8,
  /** 32-bit depth + 8-bit stencil format. */
  Depth32Stencil8,

  /** @deprecated Use `TextureFormat.BC1` instead. */
  DXT1,
  /** @deprecated Use `TextureFormat.BC3` instead. */
  DXT5
}
