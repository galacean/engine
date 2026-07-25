/** Defines how an inherit-velocity module samples its emitter velocity. */
export enum ParticleInheritVelocityMode {
  /** Capture the particle system Entity velocity when the particle is emitted. */
  Initial = 0,
  /** Continuously apply the particle system Entity velocity to World-space particles. Requires WebGL2. */
  Current = 1
}
