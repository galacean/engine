/**
 * Cooking flags for {@link MeshCollider}.
 */
export enum MeshColliderCookingFlag {
  /** Remove degenerate triangles and coincident vertices. */
  Cleaning = 0x1,
  /** Weld vertices that are close to each other. Requires {@link MeshColliderCookingFlag.Cleaning} to be enabled. */
  VertexWelding = 0x2
}
