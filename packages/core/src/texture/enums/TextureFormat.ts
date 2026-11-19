/**
 * Texture format enumeration.
 * @remarks
 * Uncompressed color formats without a type suffix store unsigned normalized values mapped to `[0, 1]`.
 * Other component encodings carry an explicit PascalCase suffix (`_SFloat`, `_UFloat`, `_UInt`).
 */
export enum TextureFormat {
  /** RGB unsigned normalized format, 8 bits per channel. */
  R8G8B8 = 0,
  /** RGBA unsigned normalized format, 8 bits per channel. */
  R8G8B8A8 = 1,
  /** RGBA unsigned normalized format, 4 bits per channel. */
  R4G4B4A4 = 2,
  /** RGBA unsigned normalized format, 5 bits in R, G, and B channels, 1 bit in A channel. */
  R5G5B5A1 = 3,
  /** RGB unsigned normalized format, 5 bits in R channel, 6 bits in G channel, 5 bits in B channel. */
  R5G6B5 = 4,
  /**
   * RGBA 16-bit signed floating-point format.
   * @remarks Upload half-float bits with `Uint16Array`. Color rendering and readback require `EXT_color_buffer_half_float` or `EXT_color_buffer_float`.
   */
  R16G16B16A16_SFloat = 7,
  /**
   * RGBA 32-bit signed floating-point format.
   * @remarks Upload with `Float32Array`. Linear filtering requires `OES_texture_float_linear`; color rendering and readback require `EXT_color_buffer_float`.
   */
  R32G32B32A32_SFloat = 8,
  /** RGBA unsigned integer format, 32 bits per channel. */
  R32G32B32A32_UInt = 9,
  /** RGB unsigned floating-point format, 11 bits in R and G channels, 10 bits in B channel. */
  R11G11B10_UFloat = 35,
  /** Single-channel 8-bit unsigned normalized format. */
  R8 = 36,
  /** Two-channel 8-bit unsigned normalized format. */
  R8G8 = 37,
  /**
   * Single-channel 16-bit unsigned normalized format.
   * @remarks Requires `EXT_texture_norm16`. Upload with `Uint16Array` (1 channel per texel); `getPixelBuffer` reads RGBA `Uint16Array` (4 channels per texel).
   */
  R16 = 38,
  /**
   * Single-channel 16-bit signed floating-point format.
   * @remarks Upload half-float bits with `Uint16Array` (1 channel per texel). Color rendering and `getPixelBuffer` (RGBA `Float32Array`) require `EXT_color_buffer_float`.
   */
  R16_SFloat = 39,
  /**
   * Two-channel 16-bit signed floating-point format.
   * @remarks Upload half-float bits with `Uint16Array` (2 channels per texel). Color rendering and `getPixelBuffer` (RGBA `Float32Array`) require `EXT_color_buffer_float`.
   */
  R16G16_SFloat = 40,
  /**
   * Single-channel 32-bit signed floating-point format.
   * @remarks Upload with `Float32Array` (1 channel per texel). Linear filtering requires `OES_texture_float_linear`; color rendering and `getPixelBuffer` (RGBA `Float32Array`) require `EXT_color_buffer_float`.
   */
  R32_SFloat = 41,
  /**
   * Two-channel 32-bit signed floating-point format.
   * @remarks Upload with `Float32Array` (2 channels per texel). Linear filtering requires `OES_texture_float_linear`; color rendering and `getPixelBuffer` (RGBA `Float32Array`) require `EXT_color_buffer_float`.
   */
  R32G32_SFloat = 42,
  /** RGB compressed format, 4 bits per pixel. */
  BC1 = 10,
  /** RGBA compressed format, 8 bits per pixel. */
  BC3 = 11,
  /** RGB(A) compressed format, 128 bits per 4x4 pixel block. */
  BC7 = 12,
  /** RGB HDR compressed format, 8 bits per pixel. */
  BC6H = 100,
  /** RGB compressed format, 4 bits per pixel. */
  ETC1_RGB = 13,
  /** RGB compressed format, 4 bits per pixel. */
  ETC2_RGB = 14,
  /** RGBA compressed format, 5 bits per pixel, 4 bit in RGB, 1 bit in A. */
  ETC2_RGBA5 = 15,
  /** RGB compressed format, 8 bits per pixel. */
  ETC2_RGBA8 = 16,
  /** RGB compressed format, 2 bits per pixel. */
  PVRTC_RGB2 = 17,
  /** RGBA compressed format, 2 bits per pixel. */
  PVRTC_RGBA2 = 18,
  /** RGB compressed format, 4 bits per pixel. */
  PVRTC_RGB4 = 19,
  /** RGBA compressed format, 4 bits per pixel. */
  PVRTC_RGBA4 = 20,
  /** RGB(A) compressed format, 128 bits per 4x4 pixel block. */
  ASTC_4x4 = 21,
  /** RGB(A) compressed format, 128 bits per 5x5 pixel block. */
  ASTC_5x5 = 22,
  /** RGB(A) compressed format, 128 bits per 6x6 pixel block. */
  ASTC_6x6 = 23,
  /** RGB(A) compressed format, 128 bits per 8x8 pixel block. */
  ASTC_8x8 = 24,
  /** RGB(A) compressed format, 128 bits per 10x10 pixel block. */
  ASTC_10x10 = 25,
  /** RGB(A) compressed format, 128 bits per 12x12 pixel block. */
  ASTC_12x12 = 26,

  /** Automatic depth format, engine will automatically select the supported precision. */
  Depth = 27,
  /** Render to stencil buffer. */
  Stencil = 28,
  /** Automatic depth stencil format, engine will automatically select the supported precision. */
  DepthStencil = 29,
  /** 16-bit depth format. */
  Depth16 = 30,
  /** 24-bit depth format. */
  Depth24 = 31,
  /** 32-bit depth format. */
  Depth32 = 32,
  /** 16-bit depth + 8-bit stencil format. */
  Depth24Stencil8 = 33,
  /** 32-bit depth + 8-bit stencil format. */
  Depth32Stencil8 = 34
}
