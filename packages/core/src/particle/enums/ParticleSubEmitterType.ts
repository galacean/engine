/**
 * Particle sub emitter trigger type.
 */
export enum ParticleSubEmitterType {
  /** Triggered when a parent particle is born. */
  Birth = 0,
  /** Triggered when a parent particle dies (lifetime expired). */
  Death = 1
}
