import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

export interface ICapsuleCollider extends ICollider {
  /**
   * the radius of collider
   * @remarks will re-alloc new PhysX object.
   */
  radius: number;

  /**
   * the height of collider
   * @remarks will re-alloc new PhysX object.
   */
  height: number;

  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param radius radius of CapsuleCollider
   * @param height height of CapsuleCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithRadiusHeight(index: number, radius: number, height: number, position: Vector3, rotation: Quaternion): void;
}
