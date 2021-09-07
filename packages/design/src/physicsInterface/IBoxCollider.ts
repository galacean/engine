import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

export interface IBoxCollider extends ICollider {
  /**
   * set size of collider
   * @remarks will re-alloc new PhysX object.
   */
  size: Vector3;

  /**
   * init Collider and alloc PhysX objects.
   * @param value size of BoxCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithSize(value: Vector3, position: Vector3, rotation: Quaternion): void;
}
