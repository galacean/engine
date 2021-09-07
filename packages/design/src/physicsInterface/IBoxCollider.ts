import { Quaternion, Vector3 } from "@oasis-engine/math";

export interface IBoxCollider {
  /**
   * init Collider and alloc PhysX objects.
   * @param value size of BoxCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithSize(value: Vector3, position: Vector3, rotation: Quaternion);
}
