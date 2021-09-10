import { IColliderShape } from "./shape";
import { Quaternion, Vector3 } from "@oasis-engine/math";

export interface ICollider {
  /**
   * attach Collider with StaticCollider
   * @param shape The Collider attached
   * @remark must call after init.
   */
  addShape(shape: IColliderShape): void;

  removeShape(shape: IColliderShape): void;

  clearShapes(): void;

  setGlobalPose(position: Vector3, rotation: Quaternion);

  getGlobalPose(): { translation: Vector3; rotation: Quaternion };
}
