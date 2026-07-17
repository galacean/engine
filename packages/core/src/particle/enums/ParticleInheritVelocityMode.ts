/** Defines which parent velocity an inherit-velocity module uses. */
export enum ParticleInheritVelocityMode {
  /** Capture the parent velocity when the child particle is emitted. */
  Initial = 0,
  /** Use the parent emitter's current velocity while the child is alive. */
  Current = 1
}
