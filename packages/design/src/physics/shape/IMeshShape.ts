import { Vector3 } from "@galacean/engine-math";
import { MeshColliderCookingFlag } from "../enums/MeshColliderCookingFlag";
import { IPhysicsShape } from "./IPhysicsShape";

/** @internal The identity and geometry revision of the source of the mesh data. */
export interface IPhysicsMeshSource {
  readonly _geometryVersion: string;
}

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
   * @param source - Identity and revision of the submitted vertices and indices
   * @returns Whether cooking succeeded. A cooking failure preserves the previous geometry.
   */
  setMeshData(
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    cookingFlags: MeshColliderCookingFlag,
    scale: Vector3,
    source: IPhysicsMeshSource
  ): boolean;

  /**
   * Change the scale without cooking new mesh data.
   * @param scale - Absolute world scale
   */
  setScale(scale: Vector3): void;
}
