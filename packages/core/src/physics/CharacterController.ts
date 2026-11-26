import { ControllerCollisionFlag, ControllerNonWalkableMode, ICharacterController } from "@galacean/engine-design";
import { MathUtil, Vector3, type Vector3Like } from "@galacean/engine-math";
import { assignmentClone, ignoreClone } from "../clone/CloneDecorators";
import { Collider } from "./Collider";
import { PhysicsUtils } from "./PhysicsUtils";
import { Rigidbody } from "./Rigidbody";

/**
 * A capsule that moves and slides along obstacles through {@link move}.
 * @remarks The Entity's world scale sizes the shape, {@link center} transforms with the Entity's world rotation and
 * scale, and {@link upDirection} orients the capsule itself. The controller moves independently of Rigidbody
 * ownership and Entity rotation.
 */
export class CharacterController extends Collider {
  private static readonly _defaultUpDirection = Object.freeze(new Vector3(0, 1, 0));
  // A Transform hook can sync another controller while publishing a moved position.
  private static readonly _tempMovePosition = new Vector3();
  private static readonly _tempSyncPosition = new Vector3();

  private _radius = 0.5;
  private _height = 2;
  private _stepOffset = 0.5;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  @assignmentClone
  private _upDirection = CharacterController._defaultUpDirection;
  private _slopeLimit = 45;

  @ignoreClone
  private _controller: ICharacterController | null = null;
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
    value = PhysicsUtils.clampNonNegative(value, "CharacterController radius");
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
    value = PhysicsUtils.clampNonNegative(value, "CharacterController height");
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
    value = PhysicsUtils.clampNonNegative(value, "CharacterController stepOffset");
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
    this._registeredScene?.physics._syncColliders(false);
    const controller = this._controller;
    if (!controller) return ControllerCollisionFlag.None;
    const flags = controller.move(disp, minDist, elapsedTime);
    const position = CharacterController._tempMovePosition;
    controller.getPosition(position);
    position.subtract(this._syncedCenter);
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
  override _sync(): void {
    const transform = this.entity.transform;
    // Reading the world matrix re-arms transform change notifications that are only sent from a clean state.
    const worldMatrix = transform.worldMatrix;
    const lossyScale = transform.lossyWorldScale;
    const position = transform.worldPosition;
    const controller = this._controller;
    const colliderCenter = this.center;
    const cx = colliderCenter.x;
    const cy = colliderCenter.y;
    const cz = colliderCenter.z;
    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;
    if (cx !== 0 || cy !== 0 || cz !== 0) {
      const e = worldMatrix.elements;
      centerX = cx * e[0] + cy * e[4] + cz * e[8];
      centerY = cx * e[1] + cy * e[5] + cz * e[9];
      centerZ = cx * e[2] + cy * e[6] + cz * e[10];
    }
    const syncedCenter = this._syncedCenter;
    const nativePosition = this._nativePosition;
    const poseChanged =
      !controller ||
      centerX !== syncedCenter.x ||
      centerY !== syncedCenter.y ||
      centerZ !== syncedCenter.z ||
      position.x !== nativePosition.x ||
      position.y !== nativePosition.y ||
      position.z !== nativePosition.z;
    const capsuleX = position.x + centerX;
    const capsuleY = position.y + centerY;
    const capsuleZ = position.z + centerZ;
    if (poseChanged) {
      if (
        !Number.isFinite(Math.fround(capsuleX)) ||
        !Number.isFinite(Math.fround(capsuleY)) ||
        !Number.isFinite(Math.fround(capsuleZ))
      ) {
        this._detach();
        return;
      }
      syncedCenter.set(centerX, centerY, centerZ);
      nativePosition.copyFrom(position);
    }

    const absScale = this._getGeometryScale(lossyScale, worldMatrix);
    if (!controller || this._geometryDirty || this._scaleChanged(absScale)) {
      const radius = this._radius * Math.max(absScale.x, absScale.z);
      const scaledHeight = this._height * absScale.y;
      if (!PhysicsUtils.isValidPositiveFloat32(radius) || !Number.isFinite(Math.fround(scaledHeight))) {
        this._detach();
        return;
      }
      this._geometryDirty = false;
      this._nativeScale.copyFrom(absScale);
      const halfHeight = Math.max(0, scaledHeight * 0.5 - radius);
      const stepOffset = Math.min(this._stepOffset, Math.max(scaledHeight, 2 * radius));
      if (!controller) {
        this._controller = this._registeredScene!.physics._nativePhysicsScene.createCharacterController({
          uniqueID: this._id,
          material: this._getNativeMaterial(),
          radius,
          halfHeight,
          stepOffset,
          contactOffset: this.contactOffset,
          collisionLayer: this._collisionLayerIndex,
          nonWalkableMode: this._nonWalkableMode,
          upDirection: this._upDirection,
          slopeLimit: this._slopeLimit,
          position: CharacterController._tempSyncPosition.set(capsuleX, capsuleY, capsuleZ)
        });
        return;
      }
      controller.setCapsule(radius, halfHeight, stepOffset);
    }
    if (poseChanged) controller.setPosition(CharacterController._tempSyncPosition.set(capsuleX, capsuleY, capsuleZ));
  }

  /**
   * @internal
   */
  override _detach(): void {
    const controller = this._controller;
    this._controller = null;
    controller?.destroy();
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
    if (!PhysicsUtils.isValidPositiveFloat32(value)) {
      throw new Error("CharacterController contactOffset must be a positive, normal, finite Float32.");
    }
    return value;
  }

  protected override _getNative(): ICharacterController | null {
    return this._controller;
  }

  // Runtime Prefab calls use this method name.
  private _setUpDirection(value: Readonly<Vector3Like>): void {
    const up = PhysicsUtils.normalizeDirection(this._upDirection, value, "CharacterController upDirection");
    if (up !== this._upDirection) {
      this._upDirection = up;
      this._controller?.setUpDirection(up);
    }
  }
}
