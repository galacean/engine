import { IColliderShape } from "./IColliderShape";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**Interface of PhysXPhysics Shape for Box */
export interface IBoxColliderShape extends IColliderShape {
  /** extents of Box Shape */
  extents: Vector3;

  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param extents size of BoxCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithSize(index: number, extents: Vector3, position: Vector3, rotation: Quaternion): void;
}
