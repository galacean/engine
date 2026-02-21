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
   * @param cookingFlags - Cooking flags
   */
  setMeshData(
    vertices: Float32Array,
    vertexCount: number,
    indices: Uint16Array | Uint32Array | null,
    isConvex: boolean,
    cookingFlags: number
  ): void;
}
