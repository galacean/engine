import { ICollider } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysXColliderShape } from "./shape/PhysXColliderShape";

/**
 * physical collider
 */
export abstract class PhysXCollider implements ICollider {
  private static _tempTransform = {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { w: 0, x: 0, y: 0, z: 1 }
  };

  /**
   * PhysX actor object
   * @internal
   */
  _pxActor: any;

  /** @internal */
  _shapes: PhysXColliderShape[] = [];

  /**
   * Attach collider shape on collider
   * @param shape The collider shape attached
   */
  addShape(shape: PhysXColliderShape) {
    this._shapes.push(shape);
    this._pxActor.attachShape(shape._pxShape);
  }

  /**
   * Remove collider shape on collider
   * @param shape The collider shape attached
   */
  removeShape(shape: PhysXColliderShape): void {
    this._pxActor.detachShape(shape._pxShape);
    let removeID = this._shapes.findIndex((value) => {
      return value == shape;
    });
    this._shapes.splice(removeID, 1);
  }

  /**
   * Set global pose of collider
   * @param position the global position
   * @param rotation the global rotation
   */
  setGlobalPose(position: Vector3, rotation: Quaternion) {
    const transform = this._transform(position, rotation);
    this._pxActor.setGlobalPose(transform, true);
  }

  /**
   * Get global pose of collider
   * @param position the global position
   * @param rotation the global rotation
   */
  getGlobalPose(position: Vector3, rotation: Quaternion) {
    const transform = this._pxActor.getGlobalPose();
    position.setValue(transform.translation.x, transform.translation.y, transform.translation.z);
    rotation.setValue(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
  }

  /**
   * PhysX transform object
   * @internal
   */
  _transform(
    pos: Vector3,
    rot: Quaternion
  ): { translation: { x: number; y: number; z: number }; rotation: { w: number; x: number; y: number; z: number } } {
    const quat = rot.normalize();
    const { translation, rotation } = PhysXCollider._tempTransform;
    translation.x = pos.x;
    translation.y = pos.y;
    translation.z = pos.z;

    rotation.x = quat.x;
    rotation.y = quat.y;
    rotation.z = quat.z;
    rotation.w = quat.w;
    return PhysXCollider._tempTransform;
  }
}
