/**
 * Bitmask of parent properties a sub-emitter inherits at the event moment.
 * Combine with bitwise OR. Values reflect the parent's currently-visible state
 * (start value modulated by ColorOverLifetime / SizeOverLifetime /
 * RotationOverLifetime at event time), not the raw start values.
 */
export enum ParticleSubEmitterInheritProperty {
  None = 0x0,
  /** Multiply parent's current color into the sub particle's start color. */
  Color = 0x1,
  /** Multiply parent's current size into the sub particle's start size. */
  Size = 0x2,
  /** Add parent's current rotation onto the sub particle's start rotation. */
  Rotation = 0x4
}
