import { ICollider } from "@oasis-engine/design";
import { Quaternion, Ray, Vector3 } from "@oasis-engine/math";
import { HitResult } from "./HitResult";
import { ColliderShape } from "./shape/ColliderShape";
import { Transform } from "./Transform";

export abstract class Collider implements ICollider {
  /** @internal */
  _shape: ColliderShape[];
  /** @internal */
  _transform: Transform = new Transform();

  /**
   * attach Collider with StaticCollider
   * @param shape The Collider attached
   * @remark must call after init.
   */
  addShape(shape: ColliderShape): void {
    shape._parent = this;
    this._shape.push(shape);
  }

  removeShape(shape: ColliderShape): void {
    let removeID = this._shape.findIndex((value) => {
      return value == shape;
    });
    this._shape.splice(removeID, 1);
  }

  setGlobalPose(position: Vector3, rotation: Quaternion) {
    this._transform.setPosition(position.x, position.y, position.z);
    this._transform.setRotationQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  getGlobalPose(translation: Vector3, rotation: Quaternion) {
    const { position, rotationQuaternion } = this._transform;
    translation.setValue(position.x, position.y, position.z);
    rotation.setValue(rotationQuaternion.x, rotationQuaternion.y, rotationQuaternion.z, rotationQuaternion.w);
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, hit: HitResult): boolean {
    this._shape.forEach((shape) => {
      if (shape._raycast(ray, hit)) {
        return true;
      }
    });
    return false;
  }
}
