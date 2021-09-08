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

  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param normal normal of planeCollider
   * @param distance distance of origin for planeCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithNormalDistance(
    index: number,
    normal: Vector3,
    distance: number,
    position: Vector3,
    rotation: Quaternion
  ): void;
}
