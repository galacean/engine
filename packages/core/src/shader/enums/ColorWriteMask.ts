/**
 * Set which color channels can be rendered to frame buffer.
 * @remarks enumeration can be combined using bit operations.
 */
export enum ColorWriteMask {
  /** Do not write to any channel. */
  None = 0,
  /** Write to the red channel. */
  Red = 0x1,
  /** Write to the green channel. */
  Green = 0x2,
  /** Write to the blue channel. */
  Blue = 0x4,
  /** Write to the alpha channel. */
  Alpha = 0x8,
  /** Write to all channel. */
  All = 0xf
}
