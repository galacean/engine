import { ICharacterController } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXPhysicsScene } from "./PhysXPhysicsScene";
import { PhysXBoxColliderShape } from "./shape/PhysXBoxColliderShape";
import { PhysXCapsuleColliderShape } from "./shape/PhysXCapsuleColliderShape";
import { PhysXColliderShape } from "./shape/PhysXColliderShape";

/**
 * Base class for character controllers.
 */
export class PhysXCharacterController implements ICharacterController {
  private static _tempVec = new Vector3();

  /** @internal */
  _id: number;
  /** @internal */
  _pxController: any;
  /** @internal */
  _pxManager: PhysXPhysicsScene;
  /** @internal */
  _shape: PhysXColliderShape;
  private _shapeScaledPosition = new Vector3();
  private _worldPosition: Vector3 = null;

  private _physXPhysics: PhysXPhysics;

  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;
  }

  /**
   * {@inheritDoc ICharacterController.move }
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return this._pxController?.move(disp, minDist, elapsedTime) ?? 0;
  }

  /**
   * {@inheritDoc ICharacterController.setWorldPosition }
   */
  setWorldPosition(position: Vector3): void {
    this._worldPosition = position;
    this._updateNativePosition();
  }

  /**
   * {@inheritDoc ICharacterController.getWorldPosition }
   */
  getWorldPosition(position: Vector3): void {
    if (this._pxController) {
      position.copyFrom(this._pxController.getPosition());
      position.subtract(this._shapeScaledPosition);
    }
  }

  /**
   * {@inheritDoc ICharacterController.setStepOffset }
   */
  setStepOffset(offset: number): void {
    this._pxController?.setStepOffset(offset);
  }

  /**
   * {@inheritDoc ICharacterController.setNonWalkableMode }
   */
  setNonWalkableMode(flag: number): void {
    this._pxController?.setNonWalkableMode(flag);
  }

  /**
   * {@inheritDoc ICharacterController.setUpDirection }
   */
  setUpDirection(up: Vector3): void {
    this._pxController?.setUpDirection(up);
  }

  /**
   * {@inheritDoc ICharacterController.setSlopeLimit }
   */
  setSlopeLimit(slopeLimit: number): void {
    this._pxController?.setSlopeLimit(slopeLimit);
  }

  /**
   * {@inheritDoc ICharacterController.addShape }
   */
  addShape(shape: PhysXColliderShape): void {
    this._pxManager && this._createPXController(this._pxManager, shape);
    this._shape = shape;
    shape._controllers.add(this);
  }

  /**
   * {@inheritDoc ICharacterController.removeShape }
   */
  removeShape(shape: PhysXColliderShape): void {
    this._destroyPXController();
    this._shape = null;
    shape._controllers.delete(this);
  }

  /**
   * {@inheritDoc ICharacterController.destroy }
   */
  destroy(): void {
    this._destroyPXController();
  }

  /**
   * @internal
   */
  _createPXController(pxManager: PhysXPhysicsScene, shape: PhysXColliderShape): void {
    let desc: any;
    if (shape instanceof PhysXBoxColliderShape) {
      desc = new this._physXPhysics._physX.PxBoxControllerDesc();
      desc.halfHeight = shape._halfSize.x;
      desc.halfSideExtent = shape._halfSize.y;
      desc.halfForwardExtent = shape._halfSize.z;
    } else if (shape instanceof PhysXCapsuleColliderShape) {
      desc = new this._physXPhysics._physX.PxCapsuleControllerDesc();
      desc.radius = shape._radius;
      desc.height = shape._halfHeight * 2;
      desc.climbingMode = 1; // constraint mode
    } else {
      throw "unsupported shape type";
    }

    desc.setMaterial(shape._pxMaterial);

    this._pxController = pxManager._getControllerManager().createController(desc);
    this._pxController.setUUID(shape._id);
  }

  /**
   * @internal
   */
  _destroyPXController(): void {
    if (this._pxController) {
      this._pxController.release();
      this._pxController = null;
    }
  }

  /**
   * @internal
   */
  _updateShapePosition(shapePosition: Vector3, worldScale: Vector3): void {
    Vector3.multiply(shapePosition, worldScale, this._shapeScaledPosition);
    this._updateNativePosition();
  }

  private _updateNativePosition() {
    const worldPosition = this._worldPosition;
    if (this._pxController && worldPosition) {
      Vector3.add(worldPosition, this._shapeScaledPosition, PhysXCharacterController._tempVec);
      this._pxController.setPosition(PhysXCharacterController._tempVec);
    }
  }
}
