/**
 * Mesh preprocessing flags for cooking options.
 * @remarks These flags control how the mesh is preprocessed during cooking.
 */
export enum MeshPreprocessingFlag {
  /**
   * When set, mesh welding is performed.
   * Vertices within the meshWeldTolerance distance will be merged.
   * Clean mesh must be enabled for this to work.
   */
  WeldVertices = 1,

  /**
   * When set, mesh cleaning is disabled.
   * This makes cooking faster but requires the input mesh to be valid.
   * When clean mesh is disabled, vertex welding is also disabled.
   */
  DisableCleanMesh = 2,

  /**
   * When set, active edges computation is disabled.
   * This makes cooking faster but may slow down contact generation.
   */
  DisableActiveEdgesPrecompute = 4,

  /**
   * When set, 32-bit indices will always be used regardless of triangle count.
   * By default, 16-bit indices are used for meshes with <= 65535 triangles.
   */
  Force32BitIndices = 8
}
