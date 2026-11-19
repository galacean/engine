/**
 * Pixel storage format for textures and render targets.
 * @remarks
 * Uncompressed color formats without a type suffix store unsigned normalized values mapped to `[0, 1]`.
 * Other encodings carry an explicit PascalCase suffix (`_SFloat`, `_UFloat`, `_UInt`).
 * Format availability depends on the active graphics backend; query with `SystemInfo.supportsTextureFormat`.
 */
export enum TextureFormat {
  /**
   * RGB 8-bit unsigned normalized format.
   * @remarks Upload 3-channel `Uint8Array`; `getPixelBuffer` reads 4-channel RGBA `Uint8Array`.
   */
  R8G8B8 = 0,
  /** RGBA 8-bit unsigned normalized format. */
  R8G8B8A8 = 1,
  /** Packed RGBA unsigned normalized format, 4 bits per channel. */
  R4G4B4A4 = 2,
  /** Packed RGBA unsigned normalized format: 5 bits each for R, G, B and 1 bit for A. */
  R5G5B5A1 = 3,
  /** Packed RGB unsigned normalized format: 5 bits for R, 6 bits for G, 5 bits for B. */
  R5G6B5 = 4,
  /**
   * RGBA 16-bit signed floating-point format.
   * @remarks Upload and read back half-float bits with `Uint16Array`. Color rendering and readback require `EXT_color_buffer_half_float` or `EXT_color_buffer_float`.
   */
  R16G16B16A16_SFloat = 7,
  /**
   * RGBA 32-bit signed floating-point format.
   * @remarks Upload and read back with `Float32Array`. Linear filtering requires `OES_texture_float_linear`; color rendering and readback require `EXT_color_buffer_float`.
   */
  R32G32B32A32_SFloat = 8,
  /**
   * RGBA 32-bit unsigned integer format.
   * @remarks Upload and read back with `Uint32Array`. Only `TextureFilterMode.Point` filtering is supported.
   */
  R32G32B32A32_UInt = 9,
  /**
   * Packed RGB unsigned floating-point format: 11 bits for R and G, 10 bits for B.
   * @remarks Upload 3-channel `Float32Array`; `getPixelBuffer` reads 4-channel RGBA `Float32Array`. Color rendering and readback require `EXT_color_buffer_float`.
   */
  R11G11B10_UFloat = 35,
  /** Single-channel 8-bit unsigned normalized format. */
  R8 = 36,
  /** Two-channel 8-bit unsigned normalized format. */
  R8G8 = 37,
  /**
   * Single-channel 16-bit unsigned normalized format.
   * @remarks Requires `EXT_texture_norm16`. Upload 1-channel `Uint16Array`; `getPixelBuffer` reads 4-channel RGBA `Uint16Array`.
   */
  R16 = 38,
  /**
   * Single-channel 16-bit signed floating-point format.
   * @remarks Upload 1-channel half-float bits with `Uint16Array`. Color rendering and `getPixelBuffer` (4-channel RGBA `Float32Array`) require `EXT_color_buffer_float`.
   */
  R16_SFloat = 39,
  /**
   * Two-channel 16-bit signed floating-point format.
   * @remarks Upload 2-channel half-float bits with `Uint16Array`. Color rendering and `getPixelBuffer` (4-channel RGBA `Float32Array`) require `EXT_color_buffer_float`.
   */
  R16G16_SFloat = 40,
  /**
   * Single-channel 32-bit signed floating-point format.
   * @remarks Upload 1-channel `Float32Array`. Linear filtering requires `OES_texture_float_linear`; color rendering and `getPixelBuffer` (4-channel RGBA `Float32Array`) require `EXT_color_buffer_float`.
   */
  R32_SFloat = 41,
  /**
   * Two-channel 32-bit signed floating-point format.
   * @remarks Upload 2-channel `Float32Array`. Linear filtering requires `OES_texture_float_linear`; color rendering and `getPixelBuffer` (4-channel RGBA `Float32Array`) require `EXT_color_buffer_float`.
   */
  R32G32_SFloat = 42,

  /** RGB S3TC/DXT1 compressed format, 4 bits per pixel (64 bits per 4x4 block). */
  BC1 = 10,
  /** RGBA S3TC/DXT5 compressed format, 8 bits per pixel (128 bits per 4x4 block). */
  BC3 = 11,
  /** RGB(A) BPTC compressed format, 8 bits per pixel (128 bits per 4x4 block). */
  BC7 = 12,
  /** RGB unsigned floating-point HDR BPTC compressed format, 8 bits per pixel (128 bits per 4x4 block). */
  BC6H = 100,
  /** RGB ETC1 compressed format, 4 bits per pixel (64 bits per 4x4 block). */
  ETC1_RGB = 13,
  /** RGB ETC2 compressed format, 4 bits per pixel (64 bits per 4x4 block). */
  ETC2_RGB = 14,
  /** RGBA ETC2 punchthrough-alpha compressed format, 4 bits per pixel (64 bits per 4x4 block). */
  ETC2_RGBA5 = 15,
  /** RGBA ETC2 EAC compressed format, 8 bits per pixel (128 bits per 4x4 block). */
  ETC2_RGBA8 = 16,
  /** RGB PVRTC compressed format, 2 bits per pixel. */
  PVRTC_RGB2 = 17,
  /** RGBA PVRTC compressed format, 2 bits per pixel. */
  PVRTC_RGBA2 = 18,
  /** RGB PVRTC compressed format, 4 bits per pixel. */
  PVRTC_RGB4 = 19,
  /** RGBA PVRTC compressed format, 4 bits per pixel. */
  PVRTC_RGBA4 = 20,
  /** RGB(A) ASTC compressed format, 128 bits per 4x4 pixel block. */
  ASTC_4x4 = 21,
  /** RGB(A) ASTC compressed format, 128 bits per 5x5 pixel block. */
  ASTC_5x5 = 22,
  /** RGB(A) ASTC compressed format, 128 bits per 6x6 pixel block. */
  ASTC_6x6 = 23,
  /** RGB(A) ASTC compressed format, 128 bits per 8x8 pixel block. */
  ASTC_8x8 = 24,
  /** RGB(A) ASTC compressed format, 128 bits per 10x10 pixel block. */
  ASTC_10x10 = 25,
  /** RGB(A) ASTC compressed format, 128 bits per 12x12 pixel block. */
  ASTC_12x12 = 26,

  /** Default depth format; maps to 32-bit floating-point depth (`DEPTH_COMPONENT32F`) in WebGL2. */
  Depth = 27,
  /**
   * 8-bit stencil renderbuffer format.
   * @remarks Supported for `RenderTarget` stencil renderbuffers only, not standalone textures.
   */
  Stencil = 28,
  /** Default depth-stencil format; maps to 32-bit floating-point depth + 8-bit stencil (`DEPTH32F_STENCIL8`) in WebGL2. */
  DepthStencil = 29,
  /** 16-bit unsigned normalized depth format. */
  Depth16 = 30,
  /** 24-bit unsigned normalized depth format. */
  Depth24 = 31,
  /** 32-bit floating-point depth format. */
  Depth32 = 32,
  /** 24-bit unsigned normalized depth + 8-bit stencil format. */
  Depth24Stencil8 = 33,
  /** 32-bit floating-point depth + 8-bit stencil format. */
  Depth32Stencil8 = 34
}
