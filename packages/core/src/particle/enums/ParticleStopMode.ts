export enum ParticleStopMode {
  /** Stop emitting new particles and clear existing particles immediately. */
  StopEmittingAndClear,
  /** Stop emitting new particles, but keep existing particles until they expire. */
  StopEmitting
}
