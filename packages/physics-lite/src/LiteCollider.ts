import { ICollider } from "@oasis-engine/design";
import { Quaternion, Ray, Vector3 } from "@oasis-engine/math";
import { HitResult } from "./HitResult";
import { LiteColliderShape } from "./shape/LiteColliderShape";
import { Transform } from "./Transform";

export abstract class LiteCollider implements ICollider {
  /** @internal */
  _shapes: LiteColliderShape[];
  /** @internal */
  _transform: Transform = new Transform();

  /**
   * {@inheritDoc ICollider.addShape }
   */
  addShape(shape: LiteColliderShape): void {
    const oldCollider = shape._collider;
    if (oldCollider !== this) {
      if (oldCollider) {
        oldCollider.removeShape(shape);
      }
      this._shapes.push(shape);
      shape._collider = this;
    }
  }

  /**
   * {@inheritDoc ICollider.removeShape }
   */
  removeShape(shape: LiteColliderShape): void {
    const index = this._shapes.indexOf(shape);
    if (index !== -1) {
      this._shapes.splice(index, 1);
      shape._collider = null;
    }
  }

  /**
   * {@inheritDoc ICollider.setWorldTransform }
   */
  setWorldTransform(position: Vector3, rotation: Quaternion): void {
    this._transform.setPosition(position.x, position.y, position.z);
    this._transform.setRotationQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  /**
   * {@inheritDoc ICollider.getWorldTransform }
   */
  getWorldTransform(outPosition: Vector3, outRotation: Quaternion): void {
    const { position, rotationQuaternion } = this._transform;
    outPosition.setValue(position.x, position.y, position.z);
    outRotation.setValue(rotationQuaternion.x, rotationQuaternion.y, rotationQuaternion.z, rotationQuaternion.w);
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, hit: HitResult): boolean {
    const shapes = this._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      if (shapes[i]._raycast(ray, hit)) {
        return true;
      }
    }
    return false;
  }
}
