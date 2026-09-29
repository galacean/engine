/**
 * Defines how emitter velocity is applied to particles.
 */
export enum ParticleInheritVelocityMode {
  /**
   * Samples emitter velocity when each particle is emitted, then scales it over that particle's lifetime.
   */
  Initial = 0,
  /**
   * Samples the emitter's current velocity every frame and scales it over each particle's lifetime.
   * Only effective in World simulation and requires WebGL2.
   */
  Current = 1
}
