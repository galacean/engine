import { Component } from "../../Component";
import { ICharacterController } from "@oasis-engine/design";
import { Vector3 } from "@oasis-engine/math";
import { PhysicsMaterial } from "../PhysicsMaterial";
import { PhysicsManager } from "../PhysicsManager";
import { Entity } from "../../Entity";

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

export class CharacterController extends Component {
  /** @internal */
  _index: number = -1;
  _nativeCharacterController: ICharacterController;

  private _stepOffset: number = 0;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PREVENT_CLIMBING;
  private _contactOffset: number = 0;
  private _upDirection = new Vector3(0, 1, 0);
  private _slopeLimit: number = 0;

  protected _id: number;
  protected _material: PhysicsMaterial;

  /// Unique id for this controller.
  get id(): number {
    return this._id;
  }

  get stepOffset(): number {
    return this._stepOffset;
  }

  set stepOffset(newValue: number) {
    this._stepOffset = newValue;
    this._nativeCharacterController.setStepOffset(newValue);
  }

  get nonWalkableMode(): ControllerNonWalkableMode {
    return this._nonWalkableMode;
  }

  set nonWalkableMode(newValue: ControllerNonWalkableMode) {
    this._nonWalkableMode = newValue;
    this._nativeCharacterController.setNonWalkableMode(newValue);
  }

  get contactOffset(): number {
    return this._contactOffset;
  }

  set contactOffset(newValue: number) {
    this._contactOffset = newValue;
    this._nativeCharacterController.setContactOffset(newValue);
  }

  get upDirection(): Vector3 {
    return this._upDirection;
  }

  set upDirection(newValue: Vector3) {
    if (this._upDirection !== newValue) {
      newValue.cloneTo(this._upDirection);
    }
    this._nativeCharacterController.setUpDirection(this._upDirection);
  }

  get slopeLimit(): number {
    return this._slopeLimit;
  }

  set slopeLimit(newValue: number) {
    this._slopeLimit = newValue;
    this._nativeCharacterController.setSlopeLimit(newValue);
  }

  constructor(entity: Entity) {
    super(entity);
    this._id = PhysicsManager._idGenerator;
    PhysicsManager._idGenerator += 1;
    this._material = new PhysicsMaterial();

    if (this.engine.physicsManager!.characterControllerManager == null) {
      this.engine.physicsManager!._createCharacterControllerManager();
    }
  }

  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return this._nativeCharacterController.move(disp, minDist, elapsedTime);
  }

  isSetControllerCollisionFlag(flags: number, flag: ControllerCollisionFlag): boolean {
    return this._nativeCharacterController.isSetControllerCollisionFlag(flags, flag);
  }

  setPosition(position: Vector3): boolean {
    return this._nativeCharacterController.setPosition(position);
  }

  setFootPosition(position: Vector3) {
    this._nativeCharacterController.setFootPosition(position);
  }

  invalidateCache() {
    this._nativeCharacterController.invalidateCache();
  }

  resize(height: number) {
    this._nativeCharacterController.resize(height);
  }

  /** @internal */
  _onLateUpdate() {
    let position = this.entity.transform!.worldPosition;
    this._nativeCharacterController.getPosition(position);
    this.entity.transform!.worldPosition = position;
  }

  /**
   * @internal
   * @override
   * */
  _onEnable() {
    this.engine._componentsManager.addCharacterController(this);
  }

  /**
   *  @internal
   *  @override
   * */
  _onDisable() {
    this.engine.physicsManager!._removeCharacterController(this);
    this.engine._componentsManager.removeCharacterController(this);
  }
}
