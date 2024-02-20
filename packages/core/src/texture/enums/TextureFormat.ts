/**
 * Defines various pixel formats.
 */
export enum TextureFormat {
  /** RGB format, 8 bits per channel. */
  R8G8B8 = 0,
  /** RGBA format, 8 bits per channel. */
  R8G8B8A8 = 1,
  /** RGBA format, 4 bits per channel. */
  R4G4B4A4 = 2,
  /** RGBA format, 5 bits in R channel, 5 bits in G channel, 5 bits in B channel, 1 bit in A channel. */
  R5G5B5A1 = 3,
  /** RGB format, 5 bits in R channel, 6 bits in G channel, 5 bits in B channel. */
  R5G6B5 = 4,
  /** Transparent format, 8 bits. */
  Alpha8 = 5,
  /** Luminance/alpha in RGB channel, alpha in A channel. */
  LuminanceAlpha = 6,
  /** RGBA format, 16 bits per channel. */
  R16G16B16A16 = 7,
  /** RGBA format, 32 bits per channel. */
  R32G32B32A32 = 8,

  /** RGB compressed format, 4 bits per pixel. */
  BC1 = 9,
  /** RGBA compressed format, 8 bits per pixel. */
  BC3 = 10,
  /** RGB(A) compressed format, 128 bits per 4x4 pixel block. */
  BC7 = 11,
  /** RGB compressed format, 4 bits per pixel. */
  ETC1_RGB = 12,
  /** RGB compressed format, 4 bits per pixel. */
  ETC2_RGB = 13,
  /** RGBA compressed format, 5 bits per pixel, 4 bit in RGB, 1 bit in A. */
  ETC2_RGBA5 = 14,
  /** RGB compressed format, 8 bits per pixel. */
  ETC2_RGBA8 = 15,
  /** RGB compressed format, 2 bits per pixel. */
  PVRTC_RGB2 = 16,
  /** RGBA compressed format, 2 bits per pixel. */
  PVRTC_RGBA2 = 17,
  /** RGB compressed format, 4 bits per pixel. */
  PVRTC_RGB4 = 18,
  /** RGBA compressed format, 4 bits per pixel. */
  PVRTC_RGBA4 = 19,
  /** RGB(A) compressed format, 128 bits per 4x4 pixel block. */
  ASTC_4x4 = 20,
  /** RGB(A) compressed format, 128 bits per 5x5 pixel block. */
  ASTC_5x5 = 21,
  /** RGB(A) compressed format, 128 bits per 6x6 pixel block. */
  ASTC_6x6 = 22,
  /** RGB(A) compressed format, 128 bits per 8x8 pixel block. */
  ASTC_8x8 = 23,
  /** RGB(A) compressed format, 128 bits per 10x10 pixel block. */
  ASTC_10x10 = 24,
  /** RGB(A) compressed format, 128 bits per 12x12 pixel block. */
  ASTC_12x12 = 25,

  /** Automatic depth format, engine will automatically select the supported precision. */
  Depth = 26,
  /** Render to stencil buffer. */
  Stencil = 27,
  /** Automatic depth stencil format, engine will automatically select the supported precision. */
  DepthStencil = 28,
  /** 16-bit depth format. */
  Depth16 = 29,
  /** 24-bit depth format. */
  Depth24 = 30,
  /** 32-bit depth format. */
  Depth32 = 31,
  /** 16-bit depth + 8-bit stencil format. */
  Depth24Stencil8 = 32,
  /** 32-bit depth + 8-bit stencil format. */
  Depth32Stencil8 = 33,

  /** @deprecated Use `TextureFormat.BC1` instead. */
  DXT1 = 9,
  /** @deprecated Use `TextureFormat.BC3` instead. */
  DXT5 = 10
}
