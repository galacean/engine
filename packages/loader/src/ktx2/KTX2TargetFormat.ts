/**
 * KTX2 transcode target format.
 */
export enum KTX2TargetFormat {
  /** RGB(A) compressed format, 128 bits per 4x4 pixel block. */
  ASTC,
  /** Unsupported format. */
  BC7,
  /** RGB(A) compressed format. */
  DXT,
  /** RGB(A) compressed format. */
  PVRTC,
  /** RGB(A) compressed format. */
  ETC,
  /** R8 format。*/
  R8,
  /** RG8 format。*/
  RG8,
  /** RGBA8 format。*/
  RGBA8
}
