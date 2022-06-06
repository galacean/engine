import { ICharacterController } from "@oasis-engine/design";
import { BoxColliderShape, CapsuleColliderShape, Vector3 } from "oasis-engine";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXColliderShape } from "../shape";

/**
 * Base class for character controllers.
 */
export class PhysXCharacterController implements ICharacterController {
  /** @internal */
  _id: number;
  /** @internal */
  _pxController: any;
  private _shape: PhysXColliderShape;

  /**
   * {@inheritDoc ICharacterController.move }
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return this._pxController.move(disp, minDist, elapsedTime);
  }

  /**
   * {@inheritDoc ICharacterController.isSetControllerCollisionFlag }
   */
  isSetControllerCollisionFlag(flags: number, flag: number): boolean {
    return this._pxController.isSetControllerCollisionFlag(flags, flag);
  }

  /**
   * {@inheritDoc ICharacterController.setPosition }
   */
  setPosition(position: Vector3): boolean {
    return this._pxController.setPosition(position);
  }

  /**
   * {@inheritDoc ICharacterController.getPosition }
   */
  getPosition(position: Vector3) {
    position.setValue(
      this._pxController.getPosition().x,
      this._pxController.getPosition().y,
      this._pxController.getPosition().z
    );
  }

  /**
   * {@inheritDoc ICharacterController.setFootPosition }
   */
  setFootPosition(position: Vector3) {
    this._pxController.setFootPosition(position);
  }

  /**
   * {@inheritDoc ICharacterController.setStepOffset }
   */
  setStepOffset(offset: number) {
    this._pxController.setStepOffset(offset);
  }

  /**
   * {@inheritDoc ICharacterController.setNonWalkableMode }
   */
  setNonWalkableMode(flag: number) {
    this._pxController.setNonWalkableMode(flag);
  }

  /**
   * {@inheritDoc ICharacterController.setContactOffset }
   */
  setContactOffset(offset: number) {
    this._pxController.setContactOffset(offset);
  }

  /**
   * {@inheritDoc ICharacterController.setUpDirection }
   */
  setUpDirection(up: Vector3) {
    this._pxController.setUpDirection(up);
  }

  /**
   * {@inheritDoc ICharacterController.setSlopeLimit }
   */
  setSlopeLimit(slopeLimit: number) {
    this._pxController.setSlopeLimit(slopeLimit);
  }

  /**
   * {@inheritDoc ICharacterController.invalidateCache }
   */
  invalidateCache() {
    this._pxController.invalidateCache();
  }

  /**
   * {@inheritDoc ICharacterController.resize }
   */
  resize(height: number) {
    this._pxController.resize(height);
  }

  /**
   * {@inheritDoc ICharacterController.updateShape }
   */
  updateShape(): void {
    const controller = this._pxController;
    const shape = this._shape;
    if (shape._isDirty) {
      if (shape instanceof BoxColliderShape) {
        controller.setHalfHeight(shape.size.x);
        controller.setHalfSideExtent(shape.size.y);
        controller.setHalfForwardExtent(shape.size.z);
      } else if (shape instanceof CapsuleColliderShape) {
        controller.setRadius(shape.radius);
        controller.setHeight(shape.height);
      }
      shape._isDirty = false;
    }
  }

  /**
   * {@inheritDoc ICharacterController.destroy }
   */
  destroy(): void {
    this._pxController.release();
  }

  /**
   * @internal
   */
  _setShape(value: PhysXColliderShape): void {
    this._shape = value;
  }
}
