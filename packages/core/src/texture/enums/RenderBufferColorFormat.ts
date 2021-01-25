/**
 * The rendering buffer color format enumeration.
 */
export enum RenderBufferColorFormat {
  /** RGB format,8 bits per channel. */
  R8G8B8,
  /** RGBA format,8 bits per channel. */
  R8G8B8A8,
  /** RGBA format,4 bits per channel. */
  R4G4B4A4,
  /** RGBA format,5 bits in R cahnnel, 5 bits in G channel, 5 bits in B cahnnel, 1 bit in A channel. */
  R5G5B5A1,
  /** RGB format,5 bits in R cahnnel, 6 bits in G channel, 5 bits in B cahnnel. */
  R5G6B5,
  /** transparent format, 8 bits. */
  Alpha8,
  /** RGBA format,16 bits per channel. */
  R16G16B16A16,
  /** RGBA format,32 bits per channel. */
  R32G32B32A32
}
