/**
 * Bitmask describing which parent particle properties a sub-emitter inherits.
 * Combine with bitwise OR.
 *
 * Position is NOT in this list — sub emitters always fire at the parent
 * particle's event position (birth or death). Toggle individual modulators
 * (Color / Size / Rotation) instead.
 *
 * Inherited values are the parent particle's start values (start color,
 * start size, start rotation), NOT the per-frame value produced by
 * ColorOverLifetime / SizeOverLifetime / RotationOverLifetime.
 */
export enum ParticleSubEmitterInheritProperty {
  None = 0x0,
  /** Multiply parent particle's start color into the sub particle's start color. */
  Color = 0x1,
  /** Multiply parent particle's start size into the sub particle's start size. */
  Size = 0x2,
  /** Add parent particle's start rotation onto the sub particle's start rotation. */
  Rotation = 0x4
}
