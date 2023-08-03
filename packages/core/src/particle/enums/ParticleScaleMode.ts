/**
 * Control how particle systems apply transform scale.
 */
export enum ParticleScaleMode {
  /** Scale the Particle System using the entire transform hierarchy. */
  Hierarchy,
  /** Scale the Particle System using only its own transform scale. (Ignores parent scale). */
  Local,
  /** Only apply transform scale to the shape component, which controls where particles are spawned, but does not affect their size or movement. */
  World
}
