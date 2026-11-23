import { CapsuleColliderDirection } from "../enums/CapsuleColliderDirection";
import { IPhysicsShape } from "./IPhysicsShape";

/**
 * Interface of a physics capsule shape.
 */
export interface ICapsuleShape extends IPhysicsShape {
  /**
   * Set the dimensions and local orientation of the capsule.
   * @param radius - Strictly positive radius with entity scale applied
   * @param halfHeight - Strictly positive half cylindrical height with entity scale applied; degenerate spheres are replaced with a sphere shape
   * @param upAxis - The local up axis
   */
  setDimensions(radius: number, halfHeight: number, upAxis: CapsuleColliderDirection): void;
}
