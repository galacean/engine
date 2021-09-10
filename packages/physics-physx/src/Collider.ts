import { ICollider, IColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./shape/ColliderShape";

export abstract class Collider implements ICollider {
  /**
   * PhysX static actor object
   * @internal
   */
  _pxActor: any;

  addShape(shape: ColliderShape) {
    this._pxActor.attachShape(shape._pxShape);
  }

  removeShape(shape: IColliderShape): void {}

  clearShapes(): void {}

  setGlobalPose(position: Vector3, rotation: Quaternion) {
    const transform = this._transform(position, rotation);
    this._pxActor.setGlobalPose(transform, true);
  }

  getGlobalPose(): { translation: Vector3; rotation: Quaternion } {
    const transform = this._pxActor.getGlobalPose();
    return {
      translation: new Vector3(transform.translation.x, transform.translation.y, transform.translation.z),
      rotation: new Quaternion(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w)
    };
  }

  /**
   * PhysX transform object
   * @internal
   */
  _transform(position: Vector3, rotation: Quaternion): any {
    const quat = rotation.normalize();
    return {
      translation: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      rotation: {
        w: quat.w, // PHYSX uses WXYZ quaternions,
        x: quat.x,
        y: quat.y,
        z: quat.z
      }
    };
  }
}
