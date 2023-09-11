import { ICharacterController } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXPhysicsManager } from "./PhysXPhysicsManager";
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
  _pxManager: PhysXPhysicsManager;
  /** @internal */
  _shape: PhysXColliderShape;
  private _scaledOffset = new Vector3();
  private _position: Vector3 = null;

  private _physXPhysics: PhysXPhysics;

  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;
  }

  /**
   * {@inheritDoc ICharacterController.move }
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return this._pxController.move(disp, minDist, elapsedTime);
  }

  /**
   * {@inheritDoc ICharacterController.setWorldPosition }
   */
  setWorldPosition(position: Vector3): void {
    this._position = position;
    if (this._pxController) {
      Vector3.add(position, this._scaledOffset, PhysXCharacterController._tempVec);
      this._pxController.setPosition(PhysXCharacterController._tempVec);
    }
  }

  /**
   * {@inheritDoc ICharacterController.getWorldPosition }
   */
  getWorldPosition(position: Vector3): void {
    position.copyFrom(this._pxController.getPosition());
    position.subtract(this._scaledOffset);
  }

  /**
   * {@inheritDoc ICharacterController.setStepOffset }
   */
  setStepOffset(offset: number): void {
    this._pxController.setStepOffset(offset);
  }

  /**
   * {@inheritDoc ICharacterController.setNonWalkableMode }
   */
  setNonWalkableMode(flag: number): void {
    this._pxController.setNonWalkableMode(flag);
  }

  /**
   * {@inheritDoc ICharacterController.setUpDirection }
   */
  setUpDirection(up: Vector3): void {
    this._pxController.setUpDirection(up);
  }

  /**
   * {@inheritDoc ICharacterController.setSlopeLimit }
   */
  setSlopeLimit(slopeLimit: number): void {
    this._pxController.setSlopeLimit(slopeLimit);
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
  _createPXController(pxManager: PhysXPhysicsManager, shape: PhysXColliderShape): void {
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

    desc.setMaterial(shape._pxMaterials[0]);

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
  _setLocalPosition(position: Vector3, scale: Vector3): void {
    Vector3.multiply(position, scale, this._scaledOffset);
    this.setWorldPosition(position);
  }
}
