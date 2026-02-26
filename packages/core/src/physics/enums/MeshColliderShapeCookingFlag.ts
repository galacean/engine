/**
 * Cooking flags for {@link MeshColliderShape}.
 */
export enum MeshColliderShapeCookingFlag {
  /** Remove degenerate triangles and coincident vertices. */
  Cleaning = 0x1,
  /** Weld vertices that are close to each other. Requires {@link MeshColliderShapeCookingFlag.Cleaning} to be enabled. */
  VertexWelding = 0x2
}
