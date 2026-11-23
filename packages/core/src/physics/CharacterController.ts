import { ICharacterController, IPhysicsMaterial } from "@galacean/engine-design";
import { MathUtil, Vector3, type Vector3Like } from "@galacean/engine-math";
import { assignmentClone, ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { Collider } from "./Collider";
import { ControllerNonWalkableMode } from "./enums/ControllerNonWalkableMode";
import type { PhysicsScene } from "./PhysicsScene";
import { Rigidbody } from "./Rigidbody";
import { directionSnapshot, normalizeDirection } from "./unitDirection";

/**
 * A capsule that moves and slides along obstacles through {@link move}.
 * @remarks The Entity's world scale sizes the shape, and {@link upDirection} orients it. The controller moves
 * independently of Rigidbody ownership and Entity rotation.
 */
export class CharacterController extends Collider {
  private static readonly _tempMovePosition = new Vector3();
  private static _tempWorldScale = new Vector3();

  private _radius = 0.5;
  private _height = 2;
  private _stepOffset = 0.5;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  @assignmentClone
  private _upDirection = directionSnapshot(0, 1, 0);
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
   * The step height used when climbing obstacles, in world units. Negative values are clamped to 0.
   * @defaultValue 0.5
   * @remarks PhysX excludes the controller from simulation and queries when the step height rounds to a non-finite
   * value or exceeds the world-Y scaled capsule height.
   */
  get stepOffset(): number {
    return this._stepOffset;
  }

  set stepOffset(value: number) {
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
   * @see {@link setUpDirection}
   */
  get upDirection(): Readonly<Vector3Like> {
    return this._upDirection;
  }

  set upDirection(value: Readonly<Vector3Like>) {
    this.setUpDirection(value);
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
   * Sets the controller's up direction from a complete vector. A zero vector leaves the direction unchanged.
   * @param value - The direction in world space, normalized on assignment.
   * @throws When the vector length is non-finite.
   */
  setUpDirection(value: Readonly<Vector3Like>): void {
    const up = normalizeDirection(this._upDirection, value, "CharacterController upDirection");
    if (up !== this._upDirection) {
      this._upDirection = up;
      this._controller?.setUpDirection(up);
    }
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
    if (!this._inScene) {
      return 0;
    }
    const controller = this._controller!;
    const flags = controller.move(disp, minDist, elapsedTime);
    const position = CharacterController._tempMovePosition;
    controller.getWorldPosition(position);
    const transform = this.entity.transform;
    transform.worldPosition = position;
    // Cache the published position so the next sync does not teleport over a rounding difference.
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
    const scene = this._registeredScene!;
    const transform = this.entity.transform;
    // Reading the world matrix re-arms transform change notifications that are only sent from a clean state
    transform.worldMatrix;
    const lossyScale = transform.lossyWorldScale;
    const position = transform.worldPosition;
    const colliderCenter = this.center;
    const scaleX = lossyScale.x;
    const scaleY = lossyScale.y;
    const scaleZ = lossyScale.z;
    const scale = CharacterController._tempWorldScale.set(Math.abs(scaleX), Math.abs(scaleY), Math.abs(scaleZ));
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

    const controller = (this._controller ||= this._createNative());
    const centerX = colliderCenter.x * scaleX;
    const centerY = colliderCenter.y * scaleY;
    const centerZ = colliderCenter.z * scaleZ;
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
      (physicsScene ?? this._registeredScene!.physics)._nativePhysicsScene.removeCharacterController(this._controller!);
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
   * PhysX requires a positive normal Float32 contact offset for character controllers.
   * @throws When the value is not a positive, normal, finite Float32.
   */
  protected override _validateContactOffset(value: number): number {
    if (!Collider._isValidPositiveFloat32(value)) {
      throw new Error("CharacterController contactOffset must be a positive, normal, finite Float32.");
    }
    return value;
  }

  protected override _onContactOffsetChanged(value: number): void {
    this._controller?.setContactOffset(value);
  }

  protected override _onIsSceneQueryChanged(value: boolean): void {
    this._controller?.setIsSceneQuery(value);
  }

  protected override _onMaterialChanged(material: IPhysicsMaterial): void {
    this._controller?.setMaterial(material);
  }

  protected override _onCollisionLayerChanged(layerIndex: number): void {
    this._controller?.setCollisionLayer(layerIndex);
  }

  protected override _destroyNative(): void {
    this._controller?.destroy();
    this._controller = null;
  }

  /** @internal */
  override _findRigidbody(): Rigidbody | null {
    return null;
  }

  private _setGeometryDirty(): void {
    this._geometryDirty = true;
    this._markDirty();
  }
}
