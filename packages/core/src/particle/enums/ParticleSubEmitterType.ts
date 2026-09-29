/**
 * Particle sub emitter trigger type.
 */
export enum ParticleSubEmitterType {
  /**
   * Evaluates the target system's emission timeline independently for each living parent particle.
   * @remarks Supports Rate over Time and Burst, but not Rate over Distance.
   */
  Birth = 0,
  /** Triggered when a parent particle dies (lifetime expired). */
  Death = 1
}
