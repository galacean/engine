import { ControllerCollisionFlag, ControllerNonWalkableMode, ICharacterController } from "@galacean/engine-design";
import { MathUtil, Vector3, type Vector3Like } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { Collider } from "./Collider";
import type { PhysicsScene } from "./PhysicsScene";
import { Rigidbody } from "./Rigidbody";
import { isValidPositiveFloat32 } from "./float32";
import { normalizeDirection } from "./unitDirection";

/**
 * A capsule that moves and slides along obstacles through {@link move}.
 * @remarks The Entity's world scale sizes the shape, and {@link upDirection} orients it. The controller moves
 * independently of Rigidbody ownership and Entity rotation.
 */
export class CharacterController extends Collider {
  private static readonly _tempMovePosition = new Vector3();
  private static readonly _tempWorldScale = new Vector3();

  private _radius = 0.5;
  private _height = 2;
  private _stepOffset = 0.5;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  private _upDirection = new Vector3(0, 1, 0);
  private _slopeLimit = 45;

  @ignoreClone
  private _controller: ICharacterController | null = null;
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
   * @remarks The absolute world Y scale scales the total height, and the larger X/Z scale scales the radius. If the
   * scaled total height is at or below twice the scaled radius, the controller degenerates to a sphere of the scaled radius.
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
   * @remarks At synchronization time, the effective step height is clamped to the scaled capsule's total height while
   * preserving the assigned value.
   * @throws When the value is not finite.
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
      this._controller?.setNonWalkableMode(value);
    }
  }

  /**
   * A read-only snapshot of the unit up direction in world space.
   * @defaultValue `(0, 1, 0)`
   * @remarks Assign a complete direction to update the up direction. A zero vector leaves it unchanged.
   * @throws When the assigned direction has non-finite length.
   */
  get upDirection(): Readonly<Vector3Like> {
    return this._upDirection;
  }

  set upDirection(value: Readonly<Vector3Like>) {
    this._setUpDirection(value);
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
      this._controller?.setSlopeLimit(value);
    }
  }

  /**
   * Moves the controller and immediately updates the Entity's world position.
   * @remarks With PhysX, scene queries see the moved shape after the next simulation step. Trigger callbacks are
   * dispatched by simulation steps. For immediate query updates, set the Entity's world position directly.
   * @param disp - Requested displacement in world space.
   * @param minDist - Stop sweeping when the remaining displacement reaches this distance or less, in world units.
   * @param elapsedTime - Time since the previous move, in seconds.
   * @returns A bit mask of {@link ControllerCollisionFlag} values, or {@link ControllerCollisionFlag.None} if inactive or no collision is reported.
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): ControllerCollisionFlag {
    const scene = this._registeredScene;
    if (!scene) {
      return ControllerCollisionFlag.None;
    }
    scene.physics._syncColliders(false);
    if (!this._inScene) {
      return ControllerCollisionFlag.None;
    }
    const controller = this._controller!;
    const flags = controller.move(disp, minDist, elapsedTime);
    const position = CharacterController._tempMovePosition;
    controller.getWorldPosition(position);
    const transform = this.entity.transform;
    const worldPosition = transform.worldPosition;
    if (position.x !== worldPosition.x || position.y !== worldPosition.y || position.z !== worldPosition.z) {
      transform.worldPosition = position;
      // Cache the published position so the next sync does not teleport over a rounding difference.
      this._nativePosition.copyFrom(transform.worldPosition);
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
    const transform = this.entity.transform;
    // Reading the world matrix re-arms transform change notifications that are only sent from a clean state.
    transform.worldMatrix;
    const lossyScale = transform.lossyWorldScale;
    const scaleX = lossyScale.x;
    const scaleY = lossyScale.y;
    const scaleZ = lossyScale.z;
    const needsAttach = !this._inScene;

    // Sync capsule dimensions and lazily create the native controller.
    const absScale = CharacterController._tempWorldScale.set(Math.abs(scaleX), Math.abs(scaleY), Math.abs(scaleZ));
    if (needsAttach || this._geometryDirty || this._scaleChanged(absScale)) {
      const radius = this._radius * Math.max(absScale.x, absScale.z);
      const scaledHeight = this._height * absScale.y;
      if (!isValidPositiveFloat32(radius) || !Number.isFinite(Math.fround(scaledHeight))) {
        this._detach();
        return;
      }
      this._geometryDirty = false;
      this._nativeScale.copyFrom(absScale);
      const halfHeight = Math.max(0, scaledHeight * 0.5 - radius);
      const stepOffset = Math.min(this._stepOffset, Math.max(scaledHeight, 2 * radius));
      (this._controller ||= this._createNative()).setCapsule(radius, halfHeight, stepOffset);
    }

    // Sync world position and signed center offset.
    const controller = this._controller!;
    const position = transform.worldPosition;
    const colliderCenter = this.center;
    const centerX = colliderCenter.x * scaleX;
    const centerY = colliderCenter.y * scaleY;
    const centerZ = colliderCenter.z * scaleZ;
    const syncedCenter = this._syncedCenter;
    const nativePosition = this._nativePosition;
    if (
      needsAttach ||
      centerX !== syncedCenter.x ||
      centerY !== syncedCenter.y ||
      centerZ !== syncedCenter.z ||
      position.x !== nativePosition.x ||
      position.y !== nativePosition.y ||
      position.z !== nativePosition.z
    ) {
      if (
        !Number.isFinite(Math.fround(position.x + centerX)) ||
        !Number.isFinite(Math.fround(position.y + centerY)) ||
        !Number.isFinite(Math.fround(position.z + centerZ))
      ) {
        this._detach();
        return;
      }
      syncedCenter.set(centerX, centerY, centerZ);
      nativePosition.copyFrom(position);
      controller.setWorldPosition(position, syncedCenter);
    }

    // Register in the native scene on first sync or after detaching.
    if (needsAttach) {
      this._registeredScene!.physics._nativePhysicsScene.addCharacterController(controller);
      this._inScene = true;
    }
  }

  /**
   * @internal
   */
  override _detach(physicsScene?: PhysicsScene): void {
    if (this._inScene) {
      (physicsScene ?? this._registeredScene!.physics)._nativePhysicsScene.removeCharacterController(this._controller!);
      this._inScene = false;
    }
  }

  /** @internal */
  override _findRigidbody(): Rigidbody | null {
    return null;
  }

  /**
   * PhysX requires a positive normal Float32 contact offset for character controllers.
   * @throws When the value is not a positive, normal, finite Float32.
   */
  protected override _validateContactOffset(value: number): number {
    if (!isValidPositiveFloat32(value)) {
      throw new Error("CharacterController contactOffset must be a positive, normal, finite Float32.");
    }
    return value;
  }

  protected override _getNative(): ICharacterController | null {
    return this._controller;
  }

  protected override _destroyNative(): void {
    this._controller?.destroy();
    this._controller = null;
  }

  // Runtime Prefab calls use this method name.
  private _setUpDirection(value: Readonly<Vector3Like>): void {
    const up = normalizeDirection(this._upDirection, value, "CharacterController upDirection");
    if (up !== this._upDirection) {
      this._upDirection = up;
      this._controller?.setUpDirection(up);
    }
  }

  private _createNative(): ICharacterController {
    const controller = Engine._nativePhysics.createCharacterController(this._id, this._getNativeMaterial());
    controller.setContactOffset(this.contactOffset);
    controller.setCollisionLayer(this._collisionLayerIndex);
    controller.setNonWalkableMode(this._nonWalkableMode);
    controller.setUpDirection(this._upDirection);
    controller.setSlopeLimit(this._slopeLimit);
    return controller;
  }
}
