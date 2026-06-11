/**
 * Bitmask of parent properties a sub-emitter inherits. Combine with bitwise OR.
 */
export enum ParticleSubEmitterInheritProperty {
  None = 0x0,
  /** Multiply parent's current color into the sub particle's start color. */
  Color = 0x1,
  /** Multiply parent's current size into the sub particle's start size. */
  Size = 0x2,
  /** Add parent's current rotation onto the sub particle's start rotation. */
  Rotation = 0x4,
  /** Emit the sub particle along the parent's velocity direction. Death events only. */
  Velocity = 0x8
}
