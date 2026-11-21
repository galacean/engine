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
   */
  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
      throw new Error("CharacterController size must be finite.");
    }
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
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
      throw new Error("CharacterController upDirection must be finite.");
    }
    const len = Math.hypot(value.x, value.y, value.z);
    if (!Number.isFinite(len)) {
      throw new Error("CharacterController upDirection must be finite.");
    }
    if (len === 0) {
      console.warn("CharacterController: upDirection cannot be a zero vector.");
      return;
    }
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
    if (!Number.isFinite(value)) {
      throw new Error("CharacterController slopeLimit must be finite.");
    }
    value = MathUtil.clamp(value, 0, 90);
    if (this._slopeLimit !== value) {
      this._slopeLimit = value;
      (<ICharacterController>this._native)?.setSlopeLimit(value);
      this._setGeometryDirty();
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._geometryDirty = true;
    //@ts-ignore
    this._size._onValueChanged = this._onSizeChanged.bind(this);
    //@ts-ignore
    this._upDirection._onValueChanged = this._setUpDirection.bind(this);
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
    const scale = CharacterController._tempWorldScale.set(
      Math.abs(lossyScale.x),
      Math.abs(lossyScale.y),
      Math.abs(lossyScale.z)
    );
    if (!this._hasValidGeometry(scale)) {
      this._detach();
      this._geometryDirty = true;
      return;
    }

    const controller = <ICharacterController>(this._native ||= this._createNative());
    const force = !this._inScene;

    const center = CharacterController._tempExtents;
    Vector3.multiply(this.center, scale, center);
    const position = transform.worldPosition;
    const syncedCenter = this._syncedCenter;
    const syncedPosition = this._syncedPosition;
    if (
      force ||
      center.x !== syncedCenter.x ||
      center.y !== syncedCenter.y ||
      center.z !== syncedCenter.z ||
      position.x !== syncedPosition.x ||
      position.y !== syncedPosition.y ||
      position.z !== syncedPosition.z
    ) {
      syncedCenter.copyFrom(center);
      syncedPosition.copyFrom(position);
      controller.setWorldPosition(position, center);
    }
    const syncedScale = this._syncedScale;
    if (
      force ||
      this._geometryDirty ||
      scale.x !== syncedScale.x ||
      scale.y !== syncedScale.y ||
      scale.z !== syncedScale.z
    ) {
      this._geometryDirty = false;
      syncedScale.copyFrom(scale);
      if (this._geometry === CharacterControllerGeometry.Box) {
        const halfExtents = CharacterController._tempExtents;
        Vector3.multiply(this._size, scale, halfExtents);
        controller.setBox(halfExtents.scale(0.5));
      } else {
        controller.setCapsule(this._radius * Math.max(scale.x, scale.z), this._height * scale.y);
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

  protected override _createNative(): ICharacterController {
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

  protected override _hasValidGeometry(scale: Vector3): boolean {
    if (this._geometry === CharacterControllerGeometry.Box) {
      const size = this._size;
      return (
        Collider._isValidPositiveFloat32(size.x * scale.x * 0.5) &&
        Collider._isValidPositiveFloat32(size.y * scale.y * 0.5) &&
        Collider._isValidPositiveFloat32(size.z * scale.z * 0.5)
      );
    }
    return (
      Collider._isValidPositiveFloat32(this._radius * Math.max(scale.x, scale.z)) &&
      Collider._isValidPositiveFloat32(this._height * scale.y)
    );
  }

  /** @internal */
  override _findRigidbody(): Rigidbody | null {
    return null;
  }

  @ignoreClone
  private _onSizeChanged(): void {
    const size = this._size;
    const xFinite = Number.isFinite(size.x);
    const yFinite = Number.isFinite(size.y);
    const zFinite = Number.isFinite(size.z);
    if (!xFinite || !yFinite || !zFinite) {
      //@ts-ignore
      const listener = size._onValueChanged;
      //@ts-ignore
      size._onValueChanged = null;
      size.set(
        xFinite && size.x >= 0 ? size.x : 0,
        yFinite && size.y >= 0 ? size.y : 0,
        zFinite && size.z >= 0 ? size.z : 0
      );
      //@ts-ignore
      size._onValueChanged = listener;
      this._setGeometryDirty();
      throw new Error("CharacterController size must be finite.");
    }
    if (size.x < 0 || size.y < 0 || size.z < 0) {
      //@ts-ignore
      const listener = size._onValueChanged;
      //@ts-ignore
      size._onValueChanged = null;
      size.set(size.x < 0 ? 0 : size.x, size.y < 0 ? 0 : size.y, size.z < 0 ? 0 : size.z);
      //@ts-ignore
      size._onValueChanged = listener;
    }
    this._setGeometryDirty();
  }

  @ignoreClone
  private _setGeometryDirty(): void {
    this._geometryDirty = true;
    this._markDirty();
  }

  @ignoreClone
  private _setUpDirection(): void {
    const up = this._upDirection;
    const len = Math.hypot(up.x, up.y, up.z);
    if (!Number.isFinite(up.x) || !Number.isFinite(up.y) || !Number.isFinite(up.z) || !Number.isFinite(len)) {
      //@ts-ignore
      const listener = up._onValueChanged;
      //@ts-ignore
      up._onValueChanged = null;
      up.set(0, 1, 0);
      //@ts-ignore
      up._onValueChanged = listener;
      (<ICharacterController>this._native)?.setUpDirection(up);
      throw new Error("CharacterController upDirection must be finite.");
    }
    if (len === 0) {
      return;
    }
    //@ts-ignore
    const listener = up._onValueChanged;
    //@ts-ignore
    up._onValueChanged = null;
    up.set(up.x / len, up.y / len, up.z / len);
    //@ts-ignore
    up._onValueChanged = listener;
    (<ICharacterController>this._native)?.setUpDirection(up);
  }
}
