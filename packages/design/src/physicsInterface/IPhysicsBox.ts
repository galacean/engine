import { IPhysicsShape } from "./IPhysicsShape";
import { Quaternion, Vector3 } from "@oasis-engine/math";

export interface IPhysicsBox extends IPhysicsShape {
  /**
   * set size of collider
   * @remarks will re-alloc new PhysX object.
   */
  size: Vector3;

  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param value size of BoxCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithSize(index: number, value: Vector3, position: Vector3, rotation: Quaternion): void;
}
