/**
 * Control how Particle Generator apply transform scale.
 */
export enum ParticleScaleMode {
  /** Scale the Particle Generator using the world scale, including all parent transforms. */
  World,
  /** Scale the Particle Generator using only its own transform scale, ignoring parent scale. */
  Local,
  /** Only scale the emission shape, particles themselves are not affected. */
  Shape
}
