import { ICollider } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXColliderShape } from "./shape/PhysXColliderShape";
import { PhysXPhysicsScene } from "./PhysXPhysicsScene";

/**
 * Abstract native rigid actor that holds collider shapes.
 */
export abstract class PhysXCollider implements ICollider {
  private static _tempTransform: {
    translation: Vector3;
    rotation: Quaternion;
  } = { translation: null!, rotation: null! };

  /** @internal  */
  _scene: PhysXPhysicsScene | null = null;
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
  addShape(shape: PhysXColliderShape): boolean {
    if (!this._pxActor.attachShape(shape._pxShape)) {
      return false;
    }
    this._shapes.push(shape);
    this._scene?._addColliderShape(shape._id);
    return true;
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
   * {@inheritDoc ICollider.replaceShape }
   */
  replaceShape(previousShape: PhysXColliderShape, newShape: PhysXColliderShape): boolean {
    if (!this._pxActor.attachShape(newShape._pxShape)) {
      return false;
    }
    this._shapes[this._shapes.indexOf(previousShape)] = newShape;
    this._pxActor.detachShape(previousShape._pxShape, true);
    this._scene?._removeColliderShape(previousShape._id);
    this._scene?._addColliderShape(newShape._id);
    return true;
  }

  /**
   * {@inheritDoc IStaticCollider.setWorldTransform }
   */
  setWorldTransform(position: Vector3, rotation: Quaternion): void {
    this._pxActor.setGlobalPose(this._transform(position, rotation), true);
  }

  /**
   * {@inheritDoc IStaticCollider.getWorldTransform }
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
