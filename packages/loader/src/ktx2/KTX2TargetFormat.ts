/**
 * KTX2 transcode target format.
 */
export enum KTX2TargetFormat {
  /** RGB(A) compressed format, 128 bits per 4x4 pixel block. */
  ASTC,
  /** RGB(A) compressed format, 128 bits per 4x4 pixel block. */
  BC7,
  /** RGB(A) compressed format, 4 bits per pixel if no alpha channel, 8 bits per pixel if has alpha channel. */
  BC1_BC3,
  /** RGB(A) compressed format, 4 bits per pixel. */
  PVRTC,
  /** RGB(A) compressed format, 4 bits per pixel if no alpha channel, 8 bits per pixel if has alpha channel. */
  ETC,
  /** R format, 8 bits per pixel. */
  R8,
  /** RG format, 16 bits per pixel. */
  R8G8,
  /** RGBA format, 32 bits per pixel. */
  R8G8B8A8,
  /** RGB HDR compressed format, 8 bits per pixel. */
  BC6H,
  /** HDR, RGBA (currently UASTC HDR 4x4 encoders are only RGB), unsigned. */
  ASTC_HDR_4x4,
  /** RGBA format, 16 bits per channel. */
  R16G16B16A16
}
