/** Defines how a sub-emitter Birth slot is evaluated. */
export enum ParticleSubEmitterMode {
  /** Emit a fixed number of particles once when the parent lifecycle event occurs. */
  Event = 0,
  /** Run the target particle system's Emission module for the whole parent-particle lifetime. */
  System = 1
}
