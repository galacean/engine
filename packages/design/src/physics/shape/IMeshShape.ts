import { Vector3 } from "@galacean/engine-math";
import { IPhysicsShape } from "./IPhysicsShape";

/**
 * Interface of a physics mesh shape.
 */
export interface IMeshShape extends IPhysicsShape {
  /**
   * Update mesh data and scale without changing the geometry type.
   * @param positions - Unscaled vertices in mesh-local space
   * @param indices - Triangle indices, or null for a convex mesh
   * @param cookingFlags - Cooking flags
   * @param scale - Absolute world scale
   * @returns Whether cooking succeeded. A cooking failure preserves the previous geometry.
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
