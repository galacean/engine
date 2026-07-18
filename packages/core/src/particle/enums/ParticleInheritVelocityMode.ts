/** Defines how an inherit-velocity module samples its emitter velocity. */
export enum ParticleInheritVelocityMode {
  /** Capture the parent velocity when the child particle is emitted. */
  Initial = 0,
  /** Continuously apply the current emitter velocity to World-space particles. Requires WebGL2. */
  Current = 1
}
