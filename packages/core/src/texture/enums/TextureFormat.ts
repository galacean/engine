/**
 * Pixel storage format for textures and render targets.
 * @remarks Uncompressed formats without a suffix are unsigned normalized (`[0, 1]`); other encodings use `_SFloat`, `_UFloat`, or `_UInt`.
 */
export enum TextureFormat {
  /** RGB 8-bit unsigned normalized format. `getPixelBuffer` outputs RGBA `Uint8Array`. */
  R8G8B8 = 0,
  /** RGBA 8-bit unsigned normalized format. */
  R8G8B8A8 = 1,
  /** Packed RGBA 4-4-4-4 unsigned normalized format. */
  R4G4B4A4 = 2,
  /** Packed RGBA 5-5-5-1 unsigned normalized format. */
  R5G5B5A1 = 3,
  /** Packed RGB 5-6-5 unsigned normalized format. */
  R5G6B5 = 4,
  /** RGBA 16-bit signed float format (half-float `Uint16Array`). */
  R16G16B16A16_SFloat = 7,
  /** RGBA 32-bit signed float format (`Float32Array`). */
  R32G32B32A32_SFloat = 8,
  /** RGBA 32-bit unsigned integer format (`Uint32Array`, `TextureFilterMode.Point` only). */
  R32G32B32A32_UInt = 9,
  /** Packed RGB 11-11-10 unsigned float format (`Float32Array`). `getPixelBuffer` outputs RGBA `Float32Array`. */
  R11G11B10_UFloat = 35,
  /** R 8-bit unsigned normalized format. */
  R8 = 36,
  /** RG 8-bit unsigned normalized format. */
  R8G8 = 37,
  /** R 16-bit unsigned normalized format (`Uint16Array`). `getPixelBuffer` outputs RGBA `Uint16Array`. */
  R16 = 38,
  /** R 16-bit signed float format (half-float `Uint16Array`). `getPixelBuffer` outputs RGBA `Float32Array`. */
  R16_SFloat = 39,
  /** RG 16-bit signed float format (half-float `Uint16Array`). `getPixelBuffer` outputs RGBA `Float32Array`. */
  R16G16_SFloat = 40,
  /** R 32-bit signed float format (`Float32Array`). `getPixelBuffer` outputs RGBA `Float32Array`. */
  R32_SFloat = 41,
  /** RG 32-bit signed float format (`Float32Array`). `getPixelBuffer` outputs RGBA `Float32Array`. */
  R32G32_SFloat = 42,

  /** RGB S3TC/DXT1 compressed format, 4 bits per pixel. */
  BC1 = 10,
  /** RGBA S3TC/DXT5 compressed format, 8 bits per pixel. */
  BC3 = 11,
  /** RGB(A) BPTC compressed format, 8 bits per pixel. */
  BC7 = 12,
  /** RGB unsigned float HDR BPTC compressed format, 8 bits per pixel. */
  BC6H = 100,
  /** RGB ETC1 compressed format, 4 bits per pixel. */
  ETC1_RGB = 13,
  /** RGB ETC2 compressed format, 4 bits per pixel. */
  ETC2_RGB = 14,
  /** RGBA ETC2 punchthrough-alpha compressed format, 4 bits per pixel. */
  ETC2_RGBA5 = 15,
  /** RGBA ETC2 EAC compressed format, 8 bits per pixel. */
  ETC2_RGBA8 = 16,
  /** RGB PVRTC compressed format, 2 bits per pixel. */
  PVRTC_RGB2 = 17,
  /** RGBA PVRTC compressed format, 2 bits per pixel. */
  PVRTC_RGBA2 = 18,
  /** RGB PVRTC compressed format, 4 bits per pixel. */
  PVRTC_RGB4 = 19,
  /** RGBA PVRTC compressed format, 4 bits per pixel. */
  PVRTC_RGBA4 = 20,
  /** RGB(A) ASTC compressed format, 128 bits per 4x4 block. */
  ASTC_4x4 = 21,
  /** RGB(A) ASTC compressed format, 128 bits per 5x5 block. */
  ASTC_5x5 = 22,
  /** RGB(A) ASTC compressed format, 128 bits per 6x6 block. */
  ASTC_6x6 = 23,
  /** RGB(A) ASTC compressed format, 128 bits per 8x8 block. */
  ASTC_8x8 = 24,
  /** RGB(A) ASTC compressed format, 128 bits per 10x10 block. */
  ASTC_10x10 = 25,
  /** RGB(A) ASTC compressed format, 128 bits per 12x12 block. */
  ASTC_12x12 = 26,

  /** Default depth format (32-bit float depth). */
  Depth = 27,
  /** 8-bit stencil format (for `RenderTarget` only). */
  Stencil = 28,
  /** Default depth-stencil format (32-bit float depth + 8-bit stencil). */
  DepthStencil = 29,
  /** 16-bit unsigned normalized depth format. */
  Depth16 = 30,
  /** 24-bit unsigned normalized depth format. */
  Depth24 = 31,
  /** 32-bit float depth format. */
  Depth32 = 32,
  /** 24-bit depth + 8-bit stencil format. */
  Depth24Stencil8 = 33,
  /** 32-bit float depth + 8-bit stencil format. */
  Depth32Stencil8 = 34
}
