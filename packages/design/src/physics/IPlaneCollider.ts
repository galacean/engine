import { Quaternion, Vector3 } from "@oasis-engine/math";

export interface IPlaneCollider {
  normal: Vector3;

  /**
   * distance of collider
   */
  getDistance(): number;

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
