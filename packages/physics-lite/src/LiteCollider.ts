import { ICollider } from "@oasis-engine/design";
import { Quaternion, Ray, Vector3 } from "@oasis-engine/math";
import { HitResult } from "./HitResult";
import { LiteColliderShape } from "./shape/LiteColliderShape";
import { Transform } from "./Transform";

export abstract class LiteCollider implements ICollider {
  /** @internal */
  _shape: LiteColliderShape[];
  /** @internal */
  _transform: Transform = new Transform();

  /**
   * attach LiteCollider with LiteStaticCollider
   * @param shape The LiteCollider attached
   * @remark must call after init.
   */
  addShape(shape: LiteColliderShape): void {
    shape._parent = this;
    this._shape.push(shape);
  }

  removeShape(shape: LiteColliderShape): void {
    let removeID = this._shape.findIndex((value) => {
      return value == shape;
    });
    this._shape.splice(removeID, 1);
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
    this._shape.forEach((shape) => {
      if (shape._raycast(ray, hit)) {
        return true;
      }
    });
    return false;
  }
}
