import { IPhysicsActor } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXShape } from "./shape/PhysXShape";
import { PhysXPhysicsScene } from "./PhysXPhysicsScene";

/**
 * PhysX rigid actor with a set of attached shapes.
 */
export abstract class PhysXActor implements IPhysicsActor {
  private static _tempTransform: {
    translation: Vector3;
    rotation: Quaternion;
  } = { translation: new Vector3(), rotation: new Quaternion() };

  /** @internal  */
  _scene: PhysXPhysicsScene | null = null;
  /** @internal */
  _pxActor: any;
  /** @internal */
  _shapes = new Array<PhysXShape>();

  protected _physXPhysics: PhysXPhysics;

  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;
  }

  /**
   * {@inheritDoc IPhysicsActor.addShape }
   */
  addShape(shape: PhysXShape): void {
    this._pxActor.attachShape(shape._pxShape);
    this._shapes.push(shape);
    this._scene?._addShape(shape._id);
  }

  /**
   * {@inheritDoc IPhysicsActor.removeShape }
   */
  removeShape(shape: PhysXShape): void {
    this._pxActor.detachShape(shape._pxShape, true);
    const shapes = this._shapes;
    shapes.splice(shapes.indexOf(shape), 1);
    this._scene?._removeShape(shape._id);
  }

  /**
   * {@inheritDoc IPhysicsActor.replaceShape }
   */
  replaceShape(previousShape: PhysXShape, newShape: PhysXShape): void {
    this._pxActor.attachShape(newShape._pxShape);
    this._shapes[this._shapes.indexOf(previousShape)] = newShape;
    this._pxActor.detachShape(previousShape._pxShape, true);
    // Keep trigger overlaps and active contacts tied to this collider ID across shape replacement.
    this._scene?._replaceShape(newShape._id);
  }

  /**
   * {@inheritDoc IPhysicsActor.setWorldTransform }
   */
  setWorldTransform(position: Vector3, rotation: Quaternion): void {
    this._pxActor.setGlobalPose(this._transform(position, rotation), true);
  }

  /**
   * {@inheritDoc IPhysicsActor.getWorldTransform }
   */
  getWorldTransform(outPosition: Vector3, outRotation: Quaternion): void {
    const { translation, rotation } = this._pxActor.getGlobalPose();
    outPosition.copyFrom(translation);
    outRotation.copyFrom(rotation);
  }

  /**
   * {@inheritDoc IPhysicsActor.destroy }
   */
  destroy(): void {
    this._pxActor.release();
  }

  /**
   * @internal
   */
  _transform(pos: Vector3, rot: Quaternion): { translation: Vector3; rotation: Quaternion } {
    const transform = PhysXActor._tempTransform;
    // Keep entity-owned vectors out of the shared pose to avoid retaining their change callbacks.
    transform.translation.copyFrom(pos);
    transform.rotation.set(0, 0, 0, 1);
    Quaternion.normalize(rot, transform.rotation);
    return transform;
  }
}
