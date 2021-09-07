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

  initWithRadiusHeight(radius: number, height: number, position: Vector3, rotation: Quaternion): void;
}
