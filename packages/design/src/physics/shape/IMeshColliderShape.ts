import { Vector3 } from "@galacean/engine-math";
import { IColliderShape } from "./IColliderShape";

/**
 * Interface for mesh collider shape.
 */
export interface IMeshColliderShape extends IColliderShape {
  /**
   * Update mesh data and scale without changing the geometry type.
   * @param positions - Vertex positions
   * @param indices - Index array (null for convex mesh)
   * @param cookingFlags - Cooking flags
   * @param scale - Absolute world scale
   * @returns Whether the update succeeded; failure leaves the shape unchanged
   */
  setMeshData(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    cookingFlags: number,
    scale: Vector3
  ): boolean;

  /**
   * Change the scale without cooking new mesh data.
   * @param scale - Absolute world scale
   */
  setScale(scale: Vector3): void;
}
