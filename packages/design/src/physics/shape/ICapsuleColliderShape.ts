import { IColliderShape } from "./IColliderShape";

/**
 * Interface of physics capsule collider shape.
 */
export interface ICapsuleColliderShape extends IColliderShape {
  /**
   * Set the dimensions and local orientation of the capsule.
   * @param radius - The radius with entity scale applied
   * @param halfHeight - Half the cylindrical height, with entity scale applied
   * @param upAxis - The local up axis
   */
  setDimensions(radius: number, halfHeight: number, upAxis: number): void;
}
