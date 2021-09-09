import { IPhysicsShape } from "./IPhysicsShape";
import { Vector3 } from "@oasis-engine/math";

export interface IPhysicsBox extends IPhysicsShape {
  /**
   * set size of collider
   * @remarks will re-alloc new PhysX object.
   */
  size: Vector3;
}
