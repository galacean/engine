import { ICollider } from "./ICollider";
import { Quaternion, Vector3 } from "@oasis-engine/math";

export interface IRigidbody {
  /**
   * attach Collider with Rigidbody
   * @param shape The Collider attached
   * @remark must call after init.
   */
  attachShape(shape: ICollider);

  init(position: Vector3, rotation: Quaternion);

  setGlobalPose(position: Vector3, rotation: Quaternion);

  getGlobalPose(): { translation: Vector3; rotation: Quaternion };

  /**
   * Moves the kinematic Rigidbody towards position.
   * @param value Provides the new position for the Rigidbody object.
   */
  MovePosition(value: Vector3);
}
