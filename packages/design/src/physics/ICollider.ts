import { IColliderShape } from "./shape";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * Interface of physical collider
 */
export interface ICollider {
  /**
   * attach collider shape on collider
   * @param shape The collider shape attached
   */
  addShape(shape: IColliderShape): void;

  /**
   * remove collider shape on collider
   * @param shape The collider shape attached
   */
  removeShape(shape: IColliderShape): void;

  /**
   * set global pose of collider
   * @param position the global position
   * @param rotation the global rotation
   */
  setGlobalPose(position: Vector3, rotation: Quaternion);

  /**
   * get global pose of collider
   * @param position the global position
   * @param rotation the global rotation
   */
  getGlobalPose(position: Vector3, rotation: Quaternion);
}
