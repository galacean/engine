import { ICharacterController } from "@galacean/engine-design";
import { MathUtil, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { CharacterControllerGeometry } from "./enums/CharacterControllerGeometry";
import { ControllerNonWalkableMode } from "./enums/ControllerNonWalkableMode";
import type { PhysicsScene } from "./PhysicsScene";
import { Rigidbody } from "./Rigidbody";

/**
 * A character controller moved by {@link move} with a "collide-and-slide" algorithm.
 * @remarks
 * The controller has inline geometry, a capsule by default or an axis-aligned box, and is never owned by a
 * {@link Rigidbody}. Its geometry follows the Entity's world scale; {@link Collider.rotation} does not apply.
 */
export class CharacterController extends Collider {
  private static _tempMovePosition = new Vector3();
  private static _tempWorldScale = new Vector3();
  private static _tempExtents = new Vector3();

  private _geometry = CharacterControllerGeometry.Capsule;
  private _radius = 0.5;
  private _height = 1;
  @ignoreClone
  private _size: Vector3;
  private _stepOffset = 0.5;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  private _upDirection = new Vector3(0, 1, 0);
  private _slopeLimit = 45;

  @ignoreClone
  private _inScene = false;
  @ignoreClone
  private _syncedCenter = new Vector3();

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
   * The capsule radius in the Entity's local space. Finite negative values are clamped to 0.
   * @defaultValue 0.5
   * @throws When the value is not finite.
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error("CharacterController radius must be finite.");
    }
    value = Math.max(0, value);
    if (this._radius !== value) {
      this._radius = value;
      this._setGeometryDirty();
    }
  }

  /**
   * The height of the capsule's cylindrical part, excluding both caps, in the Entity's local space. Finite negative values are clamped to 0.
   * @defaultValue 1
   * @throws When the value is not finite.
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error("CharacterController height must be finite.");
    }
    value = Math.max(0, value);
    if (this._height !== value) {
      this._height = value;
      this._setGeometryDirty();
    }
  }

  /**
   * The box size in the Entity's local space. Negative components are clamped to 0.
   * @defaultValue `(1, 1, 1)`
   * @remarks Mutating the returned vector updates the box size.
   */
  get size(): Vector3 {
    let size = this._size;
    if (!size) {
      this._size = size = new Vector3(1, 1, 1);
      //@ts-ignore
      size._onValueChanged = this._onSizeChanged.bind(this);
    }
    return size;
  }

  set size(value: Vector3) {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
      throw new Error("CharacterController size must be finite.");
    }
    const size = this.size;
    if (size !== value) {
      size.copyFrom(value);
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
    if (!Number.isFinite(value)) {
      throw new Error("CharacterController stepOffset must be finite.");
    }
    value = Math.max(0, value);
    if (this._stepOffset !== value) {
      this._stepOffset = value;
      (<ICharacterController>this._native)?.setStepOffset(value);
      this._setGeometryDirty();
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
    if (this._upDirection === value) return;
    const { x, y, z } = value;
    const len = Math.hypot(x, y, z);
    if (!Number.isFinite(len)) {
      throw new Error("CharacterController upDirection must be finite.");
    }
    if (len === 0) {
      console.warn("CharacterController: upDirection cannot be a zero vector.");
      return;
    }
    this._applyUpDirection(x / len, y / len, z / len);
  }

  /**
   * The slope limit in degrees for the controller.
   * @defaultValue 45
   */
  get slopeLimit(): number {
    return this._slopeLimit;
  }

  set slopeLimit(value: number) {
    if (!Number.isFinite(value)) {
      throw new Error("CharacterController slopeLimit must be finite.");
    }
    value = MathUtil.clamp(value, 0, 90);
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
    this._setUpDirection = this._setUpDirection.bind(this);
    //@ts-ignore
    this._upDirection._onValueChanged = this._setUpDirection;
  }

  /** @internal */
  override _onClone(target: CharacterController): void {
    super._onClone(target);
    const size = this._size;
    if (size) target.size = size;
  }

  /**
   * Moves the character using a "collide-and-slide" algorithm, then writes the result to the Entity's world position.
   * @remarks `entity.transform.worldPosition` updates immediately. With PhysX, `move()` advances the controller's
   * proxy kinematic actor on the next simulation step, so triggers and scene queries observe the moved pose after that
   * step; teleporting via `entity.transform` updates scene queries immediately.
   * @param disp - Displacement vector
   * @param minDist - The minimum travelled distance to consider
   * @param elapsedTime - Time elapsed since last call
   * @returns The ControllerCollisionFlag, or 0 when the controller is not active in a scene
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    const scene = this._registeredScene;
    if (!scene) {
      return 0;
    }
    scene.physics._syncColliders();
    const controller = <ICharacterController | null>this._native;
    if (!this._inScene || !controller) {
      return 0;
    }
    const flags = controller.move(disp, minDist, elapsedTime);
    const position = CharacterController._tempMovePosition;
    controller.getWorldPosition(position);
    const transform = this.entity.transform;
    transform.worldPosition = position;
    // Cache what the Entity reports so the next sync does not teleport the controller over a rounding difference
    this._nativePosition.copyFrom(transform.worldPosition);
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
  override _getVolumeDistance(): number {
    return -1;
  }

  /**
   * @internal
   */
  override _sync(): void {
    const transform = this.entity.transform;
    // Reading the world matrix re-arms transform change notifications that are only sent from a clean state
    transform.worldMatrix;
    const lossyScale = transform.lossyWorldScale;
    const position = transform.worldPosition;
    const colliderCenter = this.center;
    const scale = CharacterController._tempWorldScale.set(
      Math.abs(lossyScale.x),
      Math.abs(lossyScale.y),
      Math.abs(lossyScale.z)
    );
    const force = !this._inScene;
    const syncGeometry = force || this._geometryDirty || this._scaleChanged(scale);
    const box = this._geometry === CharacterControllerGeometry.Box;
    const dimensions = CharacterController._tempExtents;
    if (syncGeometry) {
      if (box) {
        const size = this._size;
        dimensions.set((size?.x ?? 1) * scale.x * 0.5, (size?.y ?? 1) * scale.y * 0.5, (size?.z ?? 1) * scale.z * 0.5);
      } else {
        dimensions.set(this._radius * Math.max(scale.x, scale.z), this._height * scale.y, 0);
      }
      if (
        !Collider._isValidPositiveFloat32(dimensions.x) ||
        !Collider._isValidPositiveFloat32(dimensions.y) ||
        (box && !Collider._isValidPositiveFloat32(dimensions.z))
      ) {
        this._detach();
        return;
      }
    }

    const controller = <ICharacterController>(this._native ||= this._createNative());
    const centerX = colliderCenter.x * scale.x;
    const centerY = colliderCenter.y * scale.y;
    const centerZ = colliderCenter.z * scale.z;
    const syncedCenter = this._syncedCenter;
    const nativePosition = this._nativePosition;
    if (
      force ||
      centerX !== syncedCenter.x ||
      centerY !== syncedCenter.y ||
      centerZ !== syncedCenter.z ||
      position.x !== nativePosition.x ||
      position.y !== nativePosition.y ||
      position.z !== nativePosition.z
    ) {
      syncedCenter.set(centerX, centerY, centerZ);
      nativePosition.copyFrom(position);
      controller.setWorldPosition(position, syncedCenter);
    }
    if (syncGeometry) {
      this._geometryDirty = false;
      this._nativeScale.copyFrom(scale);
      if (box) {
        controller.setBox(dimensions);
      } else {
        controller.setCapsule(dimensions.x, dimensions.y);
      }
    }
    if (force) {
      this._registeredScene!.physics._nativePhysicsScene.addCharacterController(controller);
      this._inScene = true;
    }
  }

  /**
   * @internal
   */
  override _detach(physicsScene?: PhysicsScene): void {
    if (this._inScene) {
      (physicsScene ?? this._registeredScene!.physics)._nativePhysicsScene.removeCharacterController(
        <ICharacterController>this._native
      );
      this._inScene = false;
    }
  }

  private _createNative(): ICharacterController {
    const controller = Engine._nativePhysics.createCharacterController(this._id, this._getNativeMaterial());
    controller.setContactOffset(this.contactOffset);
    controller.setCollisionLayer(this._collisionLayerIndex);
    controller.setIsSceneQuery(this.isSceneQuery);
    controller.setStepOffset(this._stepOffset);
    controller.setNonWalkableMode(this._nonWalkableMode);
    if (this._upDirection.lengthSquared() > 0) {
      controller.setUpDirection(this._upDirection);
    }
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

  protected override _onContactOffsetChanged(value: number): void {
    super._onContactOffsetChanged(value);
    this._setGeometryDirty();
  }

  /** @internal */
  override _findRigidbody(): Rigidbody | null {
    return null;
  }

  private _onSizeChanged(): void {
    const finite = CharacterController._clampBoxSize(this._size);
    this._setGeometryDirty();
    if (!finite) throw new Error("CharacterController size must be finite.");
  }

  private _setGeometryDirty(): void {
    this._geometryDirty = true;
    this._markDirty();
  }

  @ignoreClone
  private _setUpDirection(): void {
    const up = this._upDirection;
    const { x, y, z } = up;
    const len = Math.hypot(x, y, z);
    if (!Number.isFinite(len)) {
      this._applyUpDirection(0, 1, 0);
      throw new Error("CharacterController upDirection must be finite.");
    }
    if (len !== 0) this._applyUpDirection(x / len, y / len, z / len);
  }

  private _applyUpDirection(x: number, y: number, z: number): void {
    const up = this._upDirection;
    //@ts-ignore
    up._onValueChanged = null;
    up.set(x, y, z);
    //@ts-ignore
    up._onValueChanged = this._setUpDirection;
    (<ICharacterController>this._native)?.setUpDirection(up);
  }
}
