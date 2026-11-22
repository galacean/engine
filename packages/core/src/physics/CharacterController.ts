import { ICharacterController } from "@galacean/engine-design";
import { MathUtil, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { ControllerNonWalkableMode } from "./enums/ControllerNonWalkableMode";
import type { PhysicsScene } from "./PhysicsScene";
import { Rigidbody } from "./Rigidbody";

/**
 * A capsule that moves and slides along obstacles through {@link move}.
 * @remarks The Entity's world scale sizes the shape, and {@link upDirection} orients it. The controller moves
 * independently of Rigidbody ownership and Entity rotation.
 */
export class CharacterController extends Collider {
  private static readonly _movePositions: Vector3[] = [];
  private static _tempWorldScale = new Vector3();

  private _radius = 0.5;
  private _height = 2;
  private _stepOffset = 0.5;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  private _upDirection = new Vector3(0, 1, 0);
  @ignoreClone
  private _lastValidUpDirection?: Vector3;
  private _slopeLimit = 45;

  @ignoreClone
  private _inScene = false;
  @ignoreClone
  private _syncedCenter = new Vector3();

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
   * The total capsule height in local units, including both caps. Finite negative values are clamped to 0.
   * @defaultValue 2
   * @remarks A height at or below twice the radius excludes the capsule from simulation and queries.
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
   * The step height used when climbing obstacles, in world units. Finite negative values are clamped to 0.
   * @defaultValue 0.5
   * @remarks PhysX excludes the controller from simulation and queries when the step height rounds to a non-finite
   * value or exceeds the scaled height along {@link upDirection}.
   * @throws When the value is non-finite.
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
      this._setGeometryDirty();
    }
  }

  /**
   * How the controller behaves on slopes steeper than {@link slopeLimit}.
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
   * The mutable up direction in world space.
   * @defaultValue `(0, 1, 0)`
   * @remarks Assigning or mutating the vector normalizes nonzero values. A zero value retains the previous direction.
   * @throws When the vector length is non-finite.
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
    if (len > 0) this._applyUpDirection(x / len, y / len, z / len);
  }

  /**
   * The slope limit in degrees, clamped to the range 0 to 90.
   * @defaultValue 45
   * @throws When the value is non-finite.
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
    this._upDirection._onValueChanged = this._setUpDirection;
  }

  /**
   * Moves the controller and immediately updates the Entity's world position.
   * @remarks With PhysX, scene queries see the moved shape after the next simulation step. Trigger callbacks are
   * dispatched by simulation steps. For immediate query updates, set the Entity's world position directly.
   * @param disp - Requested displacement in world space.
   * @param minDist - Stop sweeping when the remaining displacement reaches this distance or less, in world units.
   * @param elapsedTime - Time since the previous move, in seconds.
   * @returns A bit mask of {@link ControllerCollisionFlag} values, or 0 if inactive or no collision is reported.
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
    const positions = CharacterController._movePositions;
    const position = positions.pop() ?? new Vector3();
    try {
      controller.getWorldPosition(position);
      const transform = this.entity.transform;
      transform.worldPosition = position;
      // Cache the published position so the next sync does not teleport over a rounding difference.
      this._nativePosition.copyFrom(transform.worldPosition);
    } finally {
      // A custom Transform setter can move another controller before consuming this position.
      positions.push(position);
    }
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
    const scene = this._registeredScene!;
    const transform = this.entity.transform;
    // Reading the world matrix re-arms transform change notifications that are only sent from a clean state
    transform.worldMatrix;
    const lossyScale = transform.lossyWorldScale;
    const position = transform.worldPosition;
    const colliderCenter = this.center;
    if (this._registeredScene !== scene) return;
    const scale = CharacterController._tempWorldScale.set(
      Math.abs(lossyScale.x),
      Math.abs(lossyScale.y),
      Math.abs(lossyScale.z)
    );
    const force = !this._inScene;
    const syncGeometry = force || this._geometryDirty || this._scaleChanged(scale);
    let radius = 0;
    let height = 0;
    if (syncGeometry) {
      radius = this._radius * Math.max(scale.x, scale.z);
      height = (this._height - 2 * this._radius) * scale.y;
      if (!Collider._isValidPositiveFloat32(radius) || !Collider._isValidPositiveFloat32(height)) {
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
      controller.setCapsule(radius, height, this._stepOffset);
    }
    if (force) {
      scene.physics._nativePhysicsScene.addCharacterController(controller);
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

  protected override _onContactOffsetChanged(value: number): void {
    super._onContactOffsetChanged(value);
    this._setGeometryDirty();
  }

  /** @internal */
  override _findRigidbody(): Rigidbody | null {
    return null;
  }

  /** @internal */
  protected override _onDestroy(): void {
    this._upDirection._onValueChanged = null;
    super._onDestroy();
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
    if (len === 0) {
      const previous = this._lastValidUpDirection;
      this._writeUpDirection(previous?.x ?? 0, previous?.y ?? 1, previous?.z ?? 0);
      return;
    }
    this._applyUpDirection(x / len, y / len, z / len);
  }

  private _applyUpDirection(x: number, y: number, z: number): void {
    const previous = this._lastValidUpDirection;
    this._writeUpDirection(x, y, z);
    if (x !== (previous?.x ?? 0) || y !== (previous?.y ?? 1) || z !== (previous?.z ?? 0)) {
      (this._lastValidUpDirection ||= new Vector3()).set(x, y, z);
      (<ICharacterController>this._native)?.setUpDirection(this._upDirection);
    }
  }

  private _writeUpDirection(x: number, y: number, z: number): void {
    const up = this._upDirection;
    if (x === up.x && y === up.y && z === up.z) return;
    const listener = up._onValueChanged;
    up._onValueChanged = null;
    up.set(x, y, z);
    up._onValueChanged = listener;
  }
}
