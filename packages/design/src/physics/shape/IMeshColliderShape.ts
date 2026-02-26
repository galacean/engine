import { Vector3 } from "@galacean/engine-math";
import { IColliderShape } from "./IColliderShape";

/**
 * Interface for mesh collider shape.
 */
export interface IMeshColliderShape extends IColliderShape {
  /**
   * Set mesh data for this collider shape.
   * @param positions - Vertex positions
   * @param indices - The index array (Uint16Array or Uint32Array), required for triangle mesh
   * @param isConvex - Whether to use convex mesh (true) or triangle mesh (false)
   * @param cookingFlags - Cooking flags
   * @returns Whether the mesh data was successfully set
   */
  setMeshData(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    cookingFlags: number
  ): boolean;
}
