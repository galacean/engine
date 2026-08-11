/**
 * Particle sub emitter trigger type.
 */
export enum ParticleSubEmitterType {
  /**
   * Runs the target system's Rate over Time and Burst emission while the parent particle is alive.
   * @remarks Rate over Distance is not supported.
   */
  Birth = 0,
  /** Triggered when a parent particle dies (lifetime expired). */
  Death = 1
}
