import { ICollider } from "@galacean/engine-design";
import { Quaternion, Ray, Vector3 } from "@galacean/engine";
import { LiteHitResult } from "./LiteHitResult";
import { LiteColliderShape } from "./shape/LiteColliderShape";
import { LiteTransform } from "./LiteTransform";
import { LitePhysicsScene } from "./LitePhysicsScene";

/**
 * Abstract class of physical collider.
 */
export abstract class LiteCollider implements ICollider {
  /** @internal */
  abstract readonly _isStaticCollider: boolean;

  /** @internal  */
  _scene: LitePhysicsScene;
  /** @internal */
  _shapes: LiteColliderShape[] = [];
  /** @internal */
  _transform: LiteTransform = new LiteTransform();

  protected constructor() {
    this._transform.owner = this;
  }

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
      this._scene?._addColliderShape(shape);
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
      this._scene?._removeColliderShape(shape);
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
    outPosition.set(position.x, position.y, position.z);
    outRotation.set(rotationQuaternion.x, rotationQuaternion.y, rotationQuaternion.z, rotationQuaternion.w);
  }

  /**
   * {@inheritDoc ICollider.destroy }
   */
  destroy(): void {}

  /**
   * @internal
   */
  _raycast(ray: Ray, onRaycast: (obj: number) => boolean, hit: LiteHitResult): boolean {
    hit.distance = Number.MAX_VALUE;
    const shapes = this._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      const shape = shapes[i];
      onRaycast(shape._id) && shape._raycast(ray, hit);
    }

    return hit.distance != Number.MAX_VALUE;
  }
}
