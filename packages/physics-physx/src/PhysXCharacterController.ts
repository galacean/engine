import { ICharacterController } from "@oasis-engine/design";
import { Vector3 } from "oasis-engine";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXPhysicsManager } from "./PhysXPhysicsManager";
import { PhysXBoxColliderShape } from "./shape/PhysXBoxColliderShape";
import { PhysXCapsuleColliderShape } from "./shape/PhysXCapsuleColliderShape";
import { PhysXColliderShape } from "./shape/PhysXColliderShape";

/**
 * Base class for character controllers.
 */
export class PhysXCharacterController implements ICharacterController {
  /** @internal */
  _id: number;
  /** @internal */
  _pxController: any;
  /** @internal */
  _pxManager: PhysXPhysicsManager;
  /** @internal */
  _shape: PhysXColliderShape;

  private _isBoxShape: boolean | null = null;
  /**
   * {@inheritDoc ICharacterController.move }
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return this._pxController.move(disp, minDist, elapsedTime);
  }

  /**
   * {@inheritDoc ICharacterController.setWorldPosition }
   */
  setWorldPosition(position: Vector3): boolean {
    return this._pxController.setPosition(position);
  }

  /**
   * {@inheritDoc ICharacterController.getWorldPosition }
   */
  getWorldPosition(position: Vector3): void {
    position.setValue(
      this._pxController.getPosition().x,
      this._pxController.getPosition().y,
      this._pxController.getPosition().z
    );
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
  }

  /**
   * {@inheritDoc ICharacterController.removeShape }
   */
  removeShape(shape: PhysXColliderShape): void {
    this._destroyPXController();
    this._shape = null;
  }

  /**
   * {@inheritDoc ICharacterController.updateShape }
   */
  updateShape(): void {
    const shape = this._shape;
    if (shape._isDirty) {
      const controller = this._pxController;
      const isBoxShape = this._isBoxShape;
      if (isBoxShape) {
        const box = <PhysXBoxColliderShape>shape;
        controller.setHalfHeight(box._halfSize.x);
        controller.setHalfSideExtent(box._halfSize.y);
        controller.setHalfForwardExtent(box._halfSize.z);
      } else {
        const capsule = <PhysXCapsuleColliderShape>shape;
        controller.setRadius(capsule._radius);
        controller.setHeight(capsule._halfHeight * 2.0);
      }
      controller.setContactOffset(shape._contactOffset);
      shape._isDirty = false;
    }
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
      desc = new PhysXPhysics._physX.PxBoxControllerDesc();
      desc.halfHeight = shape._halfSize.x;
      desc.halfSideExtent = shape._halfSize.y;
      desc.halfForwardExtent = shape._halfSize.z;
      this._isBoxShape = true;
    } else if (shape instanceof PhysXCapsuleColliderShape) {
      desc = new PhysXPhysics._physX.PxCapsuleControllerDesc();
      desc.radius = shape._radius;
      desc.height = shape._halfHeight * 2;
      desc.climbingMode = 1; // constraint mode
      this._isBoxShape = false;
    } else {
      throw "unsupported shape type";
    }

    desc.setMaterial(shape._pxMaterials[0]);

    this._pxController = pxManager._getControllerManager().createController(desc);
  }

  /**
   * @internal
   */
  _destroyPXController(): void {
    this._pxController.release();
    this._pxController = null;
  }
}
