import { ICharacterController } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./shape";
import { Collider } from "./Collider";
import { ControllerNonWalkableMode } from "./enums/ControllerNonWalkableMode";

/**
 * The character controllers.
 */
export class CharacterController extends Collider {
  /** @internal */
  _index: number = -1;
  /** @internal */
  _nativeCharacterController: ICharacterController;

  private _stepOffset: number = 0;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.Prevent_Climbing;
  private _contactOffset: number = 0;
  private _upDirection = new Vector3(0, 1, 0);
  private _slopeLimit: number = 0;

  /**
   * The step offset for the controller.
   */
  get stepOffset(): number {
    return this._stepOffset;
  }

  set stepOffset(newValue: number) {
    this._stepOffset = newValue;
    this._nativeCharacterController.setStepOffset(newValue);
  }

  /**
   * The value of the non-walkable mode.
   */
  get nonWalkableMode(): ControllerNonWalkableMode {
    return this._nonWalkableMode;
  }

  set nonWalkableMode(newValue: ControllerNonWalkableMode) {
    this._nonWalkableMode = newValue;
    this._nativeCharacterController.setNonWalkableMode(newValue);
  }

  /**
   * The up direction for the controller.
   */
  get upDirection(): Vector3 {
    return this._upDirection;
  }

  set upDirection(newValue: Vector3) {
    if (this._upDirection !== newValue) {
      newValue.cloneTo(this._upDirection);
    }
    this._nativeCharacterController.setUpDirection(this._upDirection);
  }

  /**
   * The slope limit for the controller.
   */
  get slopeLimit(): number {
    return this._slopeLimit;
  }

  set slopeLimit(newValue: number) {
    this._slopeLimit = newValue;
    this._nativeCharacterController.setSlopeLimit(newValue);
  }

  /**
   * Moves the character using a "collide-and-slide" algorithm.
   * @param disp - Displacement vector
   * @param minDist - The minimum travelled distance to consider.
   * @param elapsedTime - Time elapsed since last call
   * @return flags - The ControllerCollisionFlag
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return this._nativeCharacterController.move(disp, minDist, elapsedTime);
  }

  /**
   * Add collider shape on this controller.
   * @param shape - Collider shape
   * @override
   */
  addShape(shape: ColliderShape): void {
    if (this._shapes.length > 1) {
      throw "only allow single shape on controller!";
    }

    const oldCollider = shape._collider;
    if (oldCollider !== this) {
      if (oldCollider) {
        oldCollider.removeShape(shape);
      }
      // create controller first which will examine shape is proper.
      this._nativeCharacterController = this.engine.physicsManager._createController(shape);
      if (this.enabled && this.entity.isActiveInHierarchy) {
        this.engine.physicsManager._addCharacterController(this);
      }
      this._shapes.push(shape);
      this.engine.physicsManager._addColliderShape(shape);
      shape._collider = this;
    }
  }

  /**
   * Remove a collider shape.
   * @param shape - The collider shape.
   * @override
   */
  removeShape(shape: ColliderShape): void {
    const index = this._shapes.indexOf(shape);
    if (index !== -1) {
      this._shapes.splice(index, 1);
      this.engine.physicsManager._removeColliderShape(shape);
      shape._collider = null;

      this._nativeCharacterController.destroy();
      this._nativeCharacterController = null;
      if (this.enabled && this.entity.isActiveInHierarchy) {
        this.engine.physicsManager._removeCharacterController(this);
      }
    }
  }

  /**
   * Remove all shape attached.
   * @override
   */
  clearShapes(): void {
    this.removeShape(this._shapes[0]);
  }

  /**
   * @internal
   * @override
   */
  _onUpdate() {
    if (this._updateFlag.flag) {
      const { transform } = this.entity;
      this._nativeCharacterController.setPosition(transform.worldPosition);

      const worldScale = transform.lossyWorldScale;
      this._nativeCharacterController.resize(Math.max(worldScale.x, worldScale.y, worldScale.z));
      this._updateFlag.flag = false;
    }
    this._nativeCharacterController.updateShape();
  }

  /**
   * @internal
   * @override
   */
  _onLateUpdate() {
    let position = this.entity.transform.worldPosition;
    this._nativeCharacterController.getPosition(position);
    this.entity.transform.worldPosition = position;
    this._updateFlag.flag = false;
  }

  /**
   * @override
   * @internal
   */
  _onEnable() {
    this._nativeCharacterController && this.engine.physicsManager._addCharacterController(this);
  }

  /**
   * @override
   * @internal
   */
  _onDisable() {
    this._nativeCharacterController && this.engine.physicsManager._removeCharacterController(this);
  }
}
