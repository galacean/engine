import { IColliderShape } from "./IColliderShape";

/**
 * Interface for mesh collider shape.
 */
export interface IMeshColliderShape extends IColliderShape {
  /**
   * Set mesh data for this collider shape.
   * @param vertices - The vertex positions array (Float32Array, 3 floats per vertex)
   * @param vertexCount - Number of vertices
   * @param indices - The index array (Uint16Array or Uint32Array), required for triangle mesh
   * @param isConvex - Whether to use convex mesh (true) or triangle mesh (false)
   */
  setMeshData(
    vertices: Float32Array,
    vertexCount: number,
    indices: Uint16Array | Uint32Array | null,
    isConvex: boolean
  ): void;

  /**
   * Set whether the triangle mesh should be double-sided for collision detection.
   * Only applies to triangle mesh (non-convex). Default: false
   * @param value - Whether to enable double-sided collision
   */
  setDoubleSided(value: boolean): void;

  /**
   * Set whether to use tight bounds for convex mesh.
   * Only applies to convex mesh. Default: true
   * @param value - Whether to enable tight bounds
   */
  setTightBounds(value: boolean): void;
}
