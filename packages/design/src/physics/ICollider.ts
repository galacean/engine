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
   * set global transform of collider
   * @param position the global position
   * @param rotation the global rotation
   */
  setWorldTransform(position: Vector3, rotation: Quaternion): void;

  /**
   * get global transform of collider
   * @param outPosition the global position
   * @param outRotation the global rotation
   */
  getWorldTransform(outPosition: Vector3, outRotation: Quaternion): void;
}
