import { ICollider } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXColliderShape } from "./shape/PhysXColliderShape";
import { PhysXPhysicsScene } from "./PhysXPhysicsScene";

/**
 * Abstract class of physical collider.
 */
export abstract class PhysXCollider implements ICollider {
  private static _tempTransform: {
    translation: Vector3;
    rotation: Quaternion;
  } = { translation: null, rotation: null };

  /** @internal  */
  _scene: PhysXPhysicsScene = null;
  /** @internal */
  _pxActor: any;
  /** @internal */
  _shapes = new Array<PhysXColliderShape>();

  protected _physXPhysics: PhysXPhysics;

  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;
  }

  /**
   * {@inheritDoc ICollider.addShape }
   */
  addShape(shape: PhysXColliderShape): void {
    this._pxActor.attachShape(shape._pxShape);
    this._shapes.push(shape);
    this._scene?._addColliderShape(shape._id);
  }

  /**
   * {@inheritDoc ICollider.removeShape }
   */
  removeShape(shape: PhysXColliderShape): void {
    this._pxActor.detachShape(shape._pxShape, true);
    const shapes = this._shapes;
    shapes.splice(shapes.indexOf(shape), 1);
    this._scene?._removeColliderShape(shape._id);
  }

  /**
   * {@inheritDoc ICollider.setWorldTransform }
   */
  setWorldTransform(position: Vector3, rotation: Quaternion): void {
    this._pxActor.setGlobalPose(this._transform(position, rotation), true);
  }

  /**
   * {@inheritDoc ICollider.getWorldTransform }
   */
  getWorldTransform(outPosition: Vector3, outRotation: Quaternion): void {
    const transform = this._pxActor.getGlobalPose();
    outPosition.set(transform.translation.x, transform.translation.y, transform.translation.z);
    outRotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w);
  }

  /**
   * {@inheritDoc ICollider.destroy }
   */
  destroy(): void {
    this._pxActor.release();
  }

  /**
   * @internal
   */
  _transform(pos: Vector3, rot: Quaternion): { translation: Vector3; rotation: Quaternion } {
    const transform = PhysXCollider._tempTransform;
    transform.translation = pos;
    transform.rotation = rot.normalize();
    return transform;
  }
}
