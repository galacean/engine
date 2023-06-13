/**
 * The mode used for selecting rows of an animation in the Texture Sheet Animation Module.
 */
export enum ParticleAnimationRowMode {
  /** Use a random row for each particle. */
  Random,
  /** Use the mesh index as the row, so that meshes can be mapped to specific animation frames. */
  MeshIndex = 1
}
