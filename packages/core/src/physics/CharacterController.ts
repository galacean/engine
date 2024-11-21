import { ICharacterController } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { PhysicsScene } from "./PhysicsScene";
import { ControllerNonWalkableMode } from "./enums/ControllerNonWalkableMode";
import { ColliderShape } from "./shape";

/**
 * The character controllers.
 */
export class CharacterController extends Collider {
  private _stepOffset = 0.5;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  private _upDirection = new Vector3(0, 1, 0);
  private _slopeLimit = 0.707;
  private _contactOffset = 0.1;

  /**
   * Contact offset for this characterController, the value must be greater than or equal to 0.
   */
  get contactOffset(): number {
    return this._contactOffset;
  }

  set contactOffset(value: number) {
    if (this._contactOffset !== value && value >= 0) {
      this._contactOffset = value;
      (<ICharacterController>this._nativeCollider).setContactOffset(value);
    }
  }

  /**
   * The step offset for the controller,   // Character can overcome obstacle less than the height(stepOffset + contractOffset(0.1)).
   */
  get stepOffset(): number {
    return this._stepOffset;
  }

  set stepOffset(value: number) {
    if (this._stepOffset !== value) {
      this._stepOffset = value;
      (<ICharacterController>this._nativeCollider).setStepOffset(value);
    }
  }

  /**
   * The value of the non-walkable mode.
   */
  get nonWalkableMode(): ControllerNonWalkableMode {
    return this._nonWalkableMode;
  }

  set nonWalkableMode(value: ControllerNonWalkableMode) {
    if (this._nonWalkableMode !== value) {
      this._nonWalkableMode = value;
      (<ICharacterController>this._nativeCollider).setNonWalkableMode(value);
    }
  }

  /**
   * The up direction for the controller.
   */
  get upDirection(): Vector3 {
    return this._upDirection;
  }

  set upDirection(value: Vector3) {
    if (this._upDirection !== value) {
      this._upDirection.copyFrom(value);
    }
  }

  /**
   * The slope limit for the controller, the value is the cosine value of the maximum slope angle.
   * @defaultValue 0.707(the cosine value of 45 degrees)
   */
  get slopeLimit(): number {
    return this._slopeLimit;
  }

  set slopeLimit(value: number) {
    if (this._slopeLimit !== value) {
      this._slopeLimit = value;
      (<ICharacterController>this._nativeCollider).setSlopeLimit(value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    (<ICharacterController>this._nativeCollider) = PhysicsScene._nativePhysics.createCharacterController();

    this._setUpDirection = this._setUpDirection.bind(this);
    //@ts-ignore
    this._upDirection._onValueChanged = this._setUpDirection;

    // sync world position to physical space
    this._onUpdate();
  }

  /**
   * Moves the character using a "collide-and-slide" algorithm.
   * @param disp - Displacement vector
   * @param minDist - The minimum travelled distance to consider.
   * @param elapsedTime - Time elapsed since last call
   * @return flags - The ControllerCollisionFlag
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    const flags = (<ICharacterController>this._nativeCollider).move(disp, minDist, elapsedTime);
    this._syncWorldPositionFromPhysicalSpace();
    return flags;
  }

  /**
   * Add collider shape on this controller.
   * @param shape - Collider shape
   */
  override addShape(shape: ColliderShape): void {
    if (this._shapes.length > 0) {
      throw "only allow single shape on controller!";
    }
    super.addShape(shape);
    this._updateFlag.flag = true;
  }

  /**
   * @internal
   */
  override _onUpdate() {
    if (this._updateFlag.flag) {
      const { transform } = this.entity;
      const shapes = this.shapes;
      (<ICharacterController>this._nativeCollider).setWorldPosition(transform.worldPosition);

      const worldScale = transform.lossyWorldScale;
      for (let i = 0, n = shapes.length; i < n; i++) {
        shapes[i]._nativeShape.setWorldScale(worldScale);
      }
      this._updateFlag.flag = false;
    }
  }

  /**
   * @internal
   */
  override _onLateUpdate() {
    this._syncWorldPositionFromPhysicalSpace();
    this._updateFlag.flag = false;
  }

  /**
   * @internal
   */
  override _onEnableInScene() {
    const physics = this.scene.physics;
    physics._addCharacterController(this);

    this._syncNative();
  }

  /**
   * @internal
   */
  override _onDisableInScene() {
    const physics = this.scene.physics;
    physics._removeCharacterController(this);

    const shapes = this.shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._removeNativeShape(shapes[i], true);
    }
  }

  protected override _syncNative(): void {
    super._syncNative();
    (<ICharacterController>this._nativeCollider).setContactOffset(this._contactOffset);
    (<ICharacterController>this._nativeCollider).setStepOffset(this._stepOffset);
    (<ICharacterController>this._nativeCollider).setNonWalkableMode(this._nonWalkableMode);
    (<ICharacterController>this._nativeCollider).setUpDirection(this._upDirection);
    (<ICharacterController>this._nativeCollider).setSlopeLimit(this._slopeLimit);
  }

  private _syncWorldPositionFromPhysicalSpace(): void {
    (<ICharacterController>this._nativeCollider).getWorldPosition(this.entity.transform.worldPosition);
  }

  private _setUpDirection(): void {
    (<ICharacterController>this._nativeCollider).setUpDirection(this._upDirection);
  }
}
