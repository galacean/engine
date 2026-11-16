import { ICharacterController } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { CharacterControllerGeometry } from "./enums/CharacterControllerGeometry";
import { ControllerNonWalkableMode } from "./enums/ControllerNonWalkableMode";
import { Rigidbody } from "./Rigidbody";

/**
 * A character controller moved by {@link move} with a "collide-and-slide" algorithm.
 * @remarks
 * The controller has inline geometry, a capsule by default or an axis-aligned box, and is never owned by a
 * {@link Rigidbody}. Its geometry follows the Entity's world scale; {@link Collider.rotation} does not apply.
 */
export class CharacterController extends Collider {
  private static _tempWorldPosition = new Vector3();
  private static _tempWorldScale = new Vector3();
  private static _tempExtents = new Vector3();

  private _geometry = CharacterControllerGeometry.Capsule;
  private _radius = 0.5;
  private _height = 1;
  private _size = new Vector3(1, 1, 1);
  private _stepOffset = 0.5;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  private _upDirection = new Vector3(0, 1, 0);
  private _slopeLimit = 45;

  @ignoreClone
  private _inScene = false;
  @ignoreClone
  private _geometryDirty = true;
  @ignoreClone
  private _syncedScale = new Vector3();
  @ignoreClone
  private _syncedCenter = new Vector3();
  @ignoreClone
  private _syncedPosition = new Vector3();

  /**
   * The geometry type of the controller.
   * @defaultValue `CharacterControllerGeometry.Capsule`
   */
  get geometry(): CharacterControllerGeometry {
    return this._geometry;
  }

  set geometry(value: CharacterControllerGeometry) {
    if (this._geometry !== value) {
      this._geometry = value;
      this._setGeometryDirty();
    }
  }

  /**
   * The capsule radius in the Entity's local space.
   * @defaultValue 0.5
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    if (this._radius !== value) {
      this._radius = value;
      this._setGeometryDirty();
    }
  }

  /**
   * The height of the capsule's cylindrical part, excluding both caps, in the Entity's local space.
   * @defaultValue 1
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._setGeometryDirty();
    }
  }

  /**
   * The box size in the Entity's local space.
   * @defaultValue `(1, 1, 1)`
   */
  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    if (this._size !== value) {
      this._size.copyFrom(value);
    }
  }

  /**
   * Character controllers cannot be triggers.
   * @throws When set to true.
   */
  override get isTrigger(): boolean {
    return false;
  }

  override set isTrigger(value: boolean) {
    if (value) {
      throw new Error("CharacterController cannot be a trigger.");
    }
  }

  /**
   * The step offset for the controller, the value must be greater than or equal to 0.
   * @remarks Character can overcome obstacle less than the height(stepOffset + contactOffset).
   */
  get stepOffset(): number {
    return this._stepOffset;
  }

  set stepOffset(value: number) {
    value = Math.max(0, value);
    if (this._stepOffset !== value) {
      this._stepOffset = value;
      (<ICharacterController>this._native)?.setStepOffset(value);
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
      (<ICharacterController>this._native)?.setNonWalkableMode(value);
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
   * The slope limit in degrees for the controller.
   * @defaultValue 45
   */
  get slopeLimit(): number {
    return this._slopeLimit;
  }

  set slopeLimit(value: number) {
    if (this._slopeLimit !== value) {
      this._slopeLimit = value;
      (<ICharacterController>this._native)?.setSlopeLimit(value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    //@ts-ignore
    this._size._onValueChanged = this._setGeometryDirty.bind(this);
    //@ts-ignore
    this._upDirection._onValueChanged = this._setUpDirection.bind(this);
  }

  /**
   * Moves the character using a "collide-and-slide" algorithm, then writes the result to the Entity's world position.
   * @param disp - Displacement vector
   * @param minDist - The minimum travelled distance to consider
   * @param elapsedTime - Time elapsed since last call
   * @returns The ControllerCollisionFlag, or 0 when the controller is not in a scene
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    if (!this._phasedActiveInScene) {
      return 0;
    }
    this.scene!.physics._syncColliders();
    const controller = <ICharacterController>this._native;
    const flags = controller.move(disp, minDist, elapsedTime);
    const position = CharacterController._tempWorldPosition;
    controller.getWorldPosition(position);
    const transform = this.entity.transform;
    transform.worldPosition = position;
    // Cache what the Entity reports so the next sync does not teleport the controller over a rounding difference
    this._syncedPosition.copyFrom(transform.worldPosition);
    return flags;
  }

  /**
   * Not supported by character controllers.
   * @returns -1
   */
  override getClosestPoint(point: Vector3, outClosestPoint: Vector3): number {
    console.error("CharacterController does not support getClosestPoint.");
    return -1;
  }

  /**
   * @internal
   */
  override _sync(): void {
    const transform = this.entity.transform;
    // Reading the world matrix re-arms transform change notifications that are only sent from a clean state
    transform.worldMatrix;
    const controller = <ICharacterController>(this._native ||= this._createNative());
    const lossyScale = transform.lossyWorldScale;
    const scale = CharacterController._tempWorldScale.set(
      Math.abs(lossyScale.x),
      Math.abs(lossyScale.y),
      Math.abs(lossyScale.z)
    );
    const force = !this._inScene;

    if (force || this._geometryDirty || !Vector3.equals(scale, this._syncedScale)) {
      this._geometryDirty = false;
      this._syncedScale.copyFrom(scale);
      if (this._geometry === CharacterControllerGeometry.Box) {
        const halfExtents = CharacterController._tempExtents;
        Vector3.multiply(this._size, scale, halfExtents);
        controller.setBox(halfExtents.scale(0.5));
      } else {
        controller.setCapsule(this._radius * Math.max(scale.x, scale.z), this._height * scale.y);
      }
    }
    const center = CharacterController._tempExtents;
    Vector3.multiply(this.center, scale, center);
    if (force || !Vector3.equals(center, this._syncedCenter)) {
      this._syncedCenter.copyFrom(center);
      controller.setCenter(center);
    }
    const position = transform.worldPosition;
    if (force || !Vector3.equals(position, this._syncedPosition)) {
      this._syncedPosition.copyFrom(position);
      controller.setWorldPosition(position);
    }
    if (force) {
      this.scene!.physics._nativePhysicsScene.addCharacterController(controller);
      this._inScene = true;
    }
  }

  /**
   * @internal
   */
  override _detach(): void {
    if (this._inScene) {
      this.scene!.physics._nativePhysicsScene.removeCharacterController(<ICharacterController>this._native);
      this._inScene = false;
    }
  }

  protected override _createNative(): ICharacterController {
    const controller = Engine._nativePhysics.createCharacterController(this._id, this._getNativeMaterial());
    controller.setContactOffset(this.contactOffset);
    controller.setCollisionLayer(this._getCollisionLayerIndex());
    controller.setIsSceneQuery(this.isSceneQuery);
    controller.setStepOffset(this._stepOffset);
    controller.setNonWalkableMode(this._nonWalkableMode);
    controller.setUpDirection(this._upDirection);
    controller.setSlopeLimit(this._slopeLimit);
    return controller;
  }

  /**
   * PhysX requires a positive contact offset for character controllers.
   * @throws When the value is not positive and finite.
   */
  protected override _validateContactOffset(value: number): number {
    if (!(value > 0 && Number.isFinite(value))) {
      throw new Error("CharacterController contactOffset must be positive and finite.");
    }
    return value;
  }

  protected override _findRigidbody(): Rigidbody | null {
    return null;
  }

  @ignoreClone
  private _setGeometryDirty(): void {
    this._geometryDirty = true;
    this._markDirty();
  }

  @ignoreClone
  private _setUpDirection(): void {
    (<ICharacterController>this._native)?.setUpDirection(this._upDirection);
  }
}
