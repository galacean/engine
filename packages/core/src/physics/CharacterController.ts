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
  private _stepOffset: number = 0.5;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  private _upDirection = new Vector3(0, 1, 0);
  private _slopeLimit: number = 0.707;

  /**
   * The step offset for the controller.
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
   * The slope limit for the controller.
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
   * Remove all shape attached.
   */
  override clearShapes(): void {
    if (this._shapes.length > 0) {
      super.removeShape(this._shapes[0]);
    }
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
    const shapes = this.shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      physics._addColliderShape(shapes[i]);
    }
  }

  /**
   * @internal
   */
  override _onDisableInScene() {
    const physics = this.scene.physics;
    physics._removeCharacterController(this);
    const shapes = this.shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      physics._removeColliderShape(shapes[i]);
    }
  }

  private _syncWorldPositionFromPhysicalSpace(): void {
    (<ICharacterController>this._nativeCollider).getWorldPosition(this.entity.transform.worldPosition);
  }

  private _setUpDirection(): void {
    (<ICharacterController>this._nativeCollider).setUpDirection(this._upDirection);
  }
}
