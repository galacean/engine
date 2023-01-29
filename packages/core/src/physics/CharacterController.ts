import { ICharacterController } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { ControllerNonWalkableMode } from "./enums/ControllerNonWalkableMode";
import { PhysicsManager } from "./PhysicsManager";
import { ColliderShape } from "./shape";

/**
 * The character controllers.
 */
export class CharacterController extends Collider {
  /** @internal */
  _index: number = -1;

  private _stepOffset: number = 0;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  private _upDirection = new Vector3(0, 1, 0);
  private _slopeLimit: number = 0;

  /**
   * The step offset for the controller.
   */
  get stepOffset(): number {
    return this._stepOffset;
  }

  set stepOffset(value: number) {
    this._stepOffset = value;
    (<ICharacterController>this._nativeCollider).setStepOffset(value);
  }

  /**
   * The value of the non-walkable mode.
   */
  get nonWalkableMode(): ControllerNonWalkableMode {
    return this._nonWalkableMode;
  }

  set nonWalkableMode(value: ControllerNonWalkableMode) {
    this._nonWalkableMode = value;
    (<ICharacterController>this._nativeCollider).setNonWalkableMode(value);
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
    (<ICharacterController>this._nativeCollider).setUpDirection(this._upDirection);
  }

  /**
   * The slope limit for the controller.
   */
  get slopeLimit(): number {
    return this._slopeLimit;
  }

  set slopeLimit(value: number) {
    this._slopeLimit = value;
    (<ICharacterController>this._nativeCollider).setSlopeLimit(value);
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    (<ICharacterController>this._nativeCollider) = PhysicsManager._nativePhysics.createCharacterController();
  }

  /**
   * Moves the character using a "collide-and-slide" algorithm.
   * @param disp - Displacement vector
   * @param minDist - The minimum travelled distance to consider.
   * @param elapsedTime - Time elapsed since last call
   * @return flags - The ControllerCollisionFlag
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return (<ICharacterController>this._nativeCollider).move(disp, minDist, elapsedTime);
  }

  /**
   * Add collider shape on this controller.
   * @param shape - Collider shape
   * @override
   */
  addShape(shape: ColliderShape): void {
    if (this._shapes.length > 0) {
      throw "only allow single shape on controller!";
    }
    super.addShape(shape);
    this._updateFlag.flag = true;
  }

  /**
   * Remove all shape attached.
   * @override
   */
  clearShapes(): void {
    if (this._shapes.length > 0) {
      super.removeShape(this._shapes[0]);
    }
  }

  /**
   * @internal
   * @override
   */
  _onUpdate() {
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
   * @override
   */
  _onLateUpdate() {
    const position = this.entity.transform.worldPosition;
    (<ICharacterController>this._nativeCollider).getWorldPosition(position);
    this.entity.transform.worldPosition = position;
    this._updateFlag.flag = false;
  }

  /**
   * @override
   * @internal
   */
  _onEnable() {
    this.engine.physicsManager._addCharacterController(this);
  }

  /**
   * @override
   * @internal
   */
  _onDisable() {
    this.engine.physicsManager._removeCharacterController(this);
  }
}
