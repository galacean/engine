import { IPhysicsShape } from "./IPhysicsShape";

/**
 * Interface of a physics capsule shape.
 */
export interface ICapsuleShape extends IPhysicsShape {
  /**
   * Set the dimensions and local orientation of the capsule.
   * @param radius - The radius with entity scale applied
   * @param halfHeight - Half the cylindrical height, with entity scale applied
   * @param upAxis - The local up axis
   */
  setDimensions(radius: number, halfHeight: number, upAxis: number): void;
}
