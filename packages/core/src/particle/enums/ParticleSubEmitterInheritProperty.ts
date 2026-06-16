/**
 * Optional parent properties a sub-emitter inherits
 * Sub particles are always emitted at the parent particle's position; these flags only select
 * which additional properties are inherited on top of that.
 */
export enum ParticleSubEmitterInheritProperty {
  /** Inherit no additional properties; sub particles are still emitted at the parent's position. */
  None = 0x0,
  /** Multiply parent's current color into the sub particle's start color. */
  Color = 0x1,
  /** Multiply parent's current size into the sub particle's start size. */
  Size = 0x2,
  /** Add parent's current rotation onto the sub particle's start rotation. */
  Rotation = 0x4,
  /** Emit the sub particle along the parent's velocity direction. */
  Velocity = 0x8
}
