import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

export interface IPlaneCollider extends ICollider {
  normal: Vector3;

  /**
   * distance of collider
   */
  getDistance(): number;

  /**
   * rotate the normal of plane
   * @param quat new local quaternion
   */
  rotate(quat: Quaternion);

  initWithNormalDistance(normal: Vector3, distance: number, position: Vector3, rotation: Quaternion): void;
}
