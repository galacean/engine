import { ICharacterController } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";
import { ColliderShape } from "./shape";
import { Collider } from "./Collider";

export enum ControllerNonWalkableMode {
  /// Stops character from climbing up non-walkable slopes, but doesn't move it otherwise
  PREVENT_CLIMBING,
  /// Stops character from climbing up non-walkable slopes, and forces it to slide down those slopes
  PREVENT_CLIMBING_AND_FORCE_SLIDING
}

export enum ControllerCollisionFlag {
  /// Character is colliding to the sides.
  COLLISION_SIDES = 1,
  /// Character has collision above.
  COLLISION_UP = 2,
  /// Character has collision below.
  COLLISION_DOWN = 4
}

/**
 * Base class for character controllers.
 */
export class CharacterController extends Collider {
  /** @internal */
  _index: number = -1;
  _nativeCharacterController: ICharacterController;

  private _stepOffset: number = 0;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PREVENT_CLIMBING;
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
   * The contact offset for the controller.
   */
  get contactOffset(): number {
    return this._contactOffset;
  }

  set contactOffset(newValue: number) {
    this._contactOffset = newValue;
    this._nativeCharacterController.setContactOffset(newValue);
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

  constructor(entity: Entity) {
    super(entity);
    if (this.engine.physicsManager.characterControllerManager == null) {
      this.engine.physicsManager._createCharacterControllerManager();
    }
  }

  /**
   * Moves the character using a "collide-and-slide" algorithm.
   * @param disp Displacement vector
   * @param minDist The minimum travelled distance to consider.
   * @param elapsedTime Time elapsed since last call
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return this._nativeCharacterController.move(disp, minDist, elapsedTime);
  }

  /**
   * Test whether flags contain certain flag
   * @param flags flags number
   * @param flag certain flag
   */
  isSetControllerCollisionFlag(flags: number, flag: ControllerCollisionFlag): boolean {
    return this._nativeCharacterController.isSetControllerCollisionFlag(flags, flag);
  }

  /**
   * Sets controller's position.
   * @param position The new (center) position for the controller.
   */
  setPosition(position: Vector3): boolean {
    return this._nativeCharacterController.setPosition(position);
  }

  /**
   * Set controller's foot position.
   * @param position The new (bottom) position for the controller.
   */
  setFootPosition(position: Vector3) {
    this._nativeCharacterController.setFootPosition(position);
  }

  /**
   * Flushes internal geometry cache.
   */
  invalidateCache() {
    this._nativeCharacterController.invalidateCache();
  }

  /**
   * Resizes the controller.
   * @param height
   */
  resize(height: number) {
    this._nativeCharacterController.resize(height);
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
      this._shapes.push(shape);
      this.engine.physicsManager._addColliderShape(shape);
      shape._collider = this;

      this._nativeCharacterController = this.engine.physicsManager.characterControllerManager.createController(
        shape._nativeShape
      );
      this.engine.physicsManager._addCollider(this);
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
      this.engine.physicsManager._removeCollider(this);
    }
  }

  /**
   * @internal
   * @override
   */
  _onUpdate() {
    if (this._updateFlag.flag) {
      const { transform } = this.entity;
      this._nativeCharacterController.setPosition(transform.worldPosition);
      this._updateFlag.flag = false;

      const worldScale = transform.lossyWorldScale;
      for (let i = 0, n = this.shapes.length; i < n; i++) {
        this.shapes[i]._nativeShape.setWorldScale(worldScale);
      }
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
  }
}
