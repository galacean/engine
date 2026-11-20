import {
  ICharacterController,
  ICollider,
  IColliderShape,
  IPhysicsMaterial,
  IStaticCollider
} from "@galacean/engine-design";
import { MathUtil, Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { BasicResources } from "../BasicResources";
import { ignoreClone } from "../clone/CloneDecorators";
import type { ICloneHook } from "../clone/ICloneHook";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { Layer } from "../Layer";
import { Transform, TransformModifyFlags } from "../Transform";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { Rigidbody } from "./Rigidbody";

/**
 * Base class for colliders.
 * @remarks
 * The nearest {@link Rigidbody} on the Collider's Entity or its ancestors owns the Collider. Without one, the Collider
 * is static and follows its own Entity. Disabling the owning Rigidbody removes its Colliders from simulation and
 * queries; it never turns them into static Colliders.
 *
 * Geometry that only supports kinematic bodies, a non-convex {@link MeshCollider} or a {@link PlaneCollider}, is
 * excluded from simulation and queries while its owner is a non-kinematic Rigidbody, and an error is logged. Adding
 * such a Rigidbody or moving the Collider under one cannot be rejected, so the Collider rejoins when the Rigidbody
 * becomes kinematic or no longer owns it.
 *
 * Moving a Collider between Rigidbodies, or between a Rigidbody and static, keeps its trigger pairs when they still
 * overlap after the next step; pairs that no longer overlap end with `onTriggerExit`. Its collision pairs restart with
 * another `onCollisionEnter`.
 * @decorator `@dependentComponents(Transform, DependentMode.CheckOnly)`
 */
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Collider extends Component implements ICloneHook<Collider> {
  private static _idGenerator = 0;
  private static _tempPosition = new Vector3();
  private static _tempRotation = new Quaternion();
  private static _tempLocalRotation = new Quaternion();
  private static _tempBodyRotation = new Quaternion();
  private static _tempScale = new Vector3();
  private static _shearTolerance = 1e-4;

  /** @internal */
  @ignoreClone
  _id: number;
  /** @internal The native shape or controller, created from the current fields when first needed. */
  @ignoreClone
  _native: IColliderShape | ICharacterController | null = null;
  /** @internal */
  @ignoreClone
  _dirtyIndex = -1;
  /** @internal The Rigidbody whose native actor holds the shape. */
  @ignoreClone
  _attachedBody: Rigidbody | null = null;

  /** Index of the single collision layer. */
  protected _collisionLayerIndex = 0;
  @ignoreClone
  protected _geometryDirty = false;

  @ignoreClone
  private _nativeActor: ICollider | null = null;
  @ignoreClone
  private _staticActor: IStaticCollider | null = null;
  @ignoreClone
  private _rejectedBody: Rigidbody | null = null;
  @ignoreClone
  private _failedTransferTarget: Rigidbody | null | undefined = undefined;
  @ignoreClone
  private _failedTransferFallback: Rigidbody | null = null;
  @ignoreClone
  private _failedTransferStamp = 0;
  @ignoreClone
  private _shearWarned = false;
  @ignoreClone
  private _nativePosition = new Vector3();
  @ignoreClone
  private _nativeRotation = new Quaternion();
  @ignoreClone
  protected _nativeScale = new Vector3();
  @ignoreClone
  private _nativeWorldPosition = new Vector3();
  @ignoreClone
  private _nativeWorldRotation = new Quaternion();

  private _center = new Vector3();
  private _rotation = new Vector3();
  protected _isTrigger = false;
  private _isSceneQuery = true;
  private _contactOffset = 0.02;
  @ignoreClone
  private _material: PhysicsMaterial | null = null;
  @ignoreClone
  private _materialInstanced = false;

  /**
   * The Rigidbody that owns this Collider: the nearest one on this Entity or its ancestors.
   * @remarks Derived from the hierarchy. It does not change when either component is disabled.
   */
  get attachedRigidbody(): Rigidbody | null {
    if (this._dirtyIndex === -1 && this._nativeActor) {
      return this._attachedBody;
    }
    const hierarchyBody = this._findRigidbody();
    if (
      this._dirtyIndex === -1 &&
      this._failedTransferTarget !== undefined &&
      hierarchyBody === this._failedTransferTarget &&
      !this._hasHierarchyChangedSince(this._failedTransferStamp)
    ) {
      const fallback = this._failedTransferFallback;
      if (fallback === null) {
        return null;
      }
      if (!fallback.destroyed && fallback.entity._scene === this.entity._scene) {
        return fallback;
      }
    }
    return hierarchyBody;
  }

  /**
   * The center of the Collider in the Entity's local space.
   * @remarks The center is scaled by the absolute world scale, so a negative scale does not mirror it.
   */
  get center(): Vector3 {
    return this._center;
  }

  set center(value: Vector3) {
    if (this._center !== value) {
      this._center.copyFrom(value);
    }
  }

  /**
   * The local rotation of the Collider, in degrees.
   * @remarks A non-uniform world scale is applied along the rotated axes of the Collider, not the Entity's axes.
   */
  get rotation(): Vector3 {
    return this._rotation;
  }

  set rotation(value: Vector3) {
    if (this._rotation !== value) {
      this._rotation.copyFrom(value);
    }
  }

  /**
   * Whether this Collider is a trigger, which reports overlaps without a collision response.
   */
  get isTrigger(): boolean {
    return this._isTrigger;
  }

  set isTrigger(value: boolean) {
    this._setIsTrigger(value);
  }

  /**
   * @internal
   * @beta
   * Whether this Collider participates in scene queries, including raycasts, shape casts, and overlap queries.
   * This does not affect collision response.
   */
  get isSceneQuery(): boolean {
    return this._isSceneQuery;
  }

  set isSceneQuery(value: boolean) {
    if (this._isSceneQuery !== value) {
      this._isSceneQuery = value;
      this._native?.setIsSceneQuery(value);
    }
  }

  /**
   * Contact offset for this Collider. Finite negative values are clamped to 0.
   * @defaultValue 0.02
   * @throws When the value is not finite, or not positive on a CharacterController.
   */
  get contactOffset(): number {
    return this._contactOffset;
  }

  set contactOffset(value: number) {
    value = this._validateContactOffset(value);
    if (this._contactOffset !== value) {
      this._contactOffset = value;
      this._onContactOffsetChanged(value);
    }
  }

  /**
   * The assigned material, or null to use the shared default material.
   * @defaultValue null
   * @remarks Retains an assigned material until replaced or the Collider is destroyed. Use
   * {@link getInstanceMaterial} to obtain a per-Collider instance.
   * @throws When the material belongs to another engine.
   */
  get material(): PhysicsMaterial | null {
    return this._material;
  }

  set material(value: PhysicsMaterial | null) {
    if (this._material !== value) {
      if (value && value.engine !== this.engine) {
        throw new Error("The physics material belongs to another engine.");
      }
      this._materialInstanced = false;
      this._material && this._addResourceReferCount(this._material, -1);
      value && this._addResourceReferCount(value, 1);
      this._material = value;
      this._native?.setMaterial(this._getNativeMaterial());
    }
  }

  /**
   * The collision layer of this Collider, only a single layer is supported.
   * @defaultValue `Layer.Layer0`
   * @remarks Changing the layer keeps active pairs that still pass the collision matrix. A trigger pair that no longer
   * passes ends with `onTriggerExit`.
   */
  get collisionLayer(): Layer {
    // Unsigned shift keeps Layer31 positive
    return ((1 << this._collisionLayerIndex) >>> 0) as Layer;
  }

  set collisionLayer(value: Layer) {
    const index = Collider._getLayerIndex(value);
    if (this._collisionLayerIndex !== index) {
      this._collisionLayerIndex = index;
      this._native?.setCollisionLayer(index);
    }
  }

  /**
   * @internal
   * @returns The index of a single collision layer
   * @throws When the value is not exactly one of `Layer.Layer0` to `Layer.Layer31`.
   */
  static _getLayerIndex(layer: Layer): number {
    const index = Math.log2(layer);
    if (!Number.isInteger(index) || index < 0 || index > 31) {
      throw new Error("Collision layer must be a single layer (Layer.Layer0 to Layer.Layer31)");
    }
    return index;
  }

  /**
   * @internal
   * @returns Whether the value is a positive, normal, finite float32 extent safe for native physics geometry.
   */
  static _isValidPositiveFloat32(value: number): boolean {
    const f = Math.fround(value);
    return f >= 1.17549435e-38 && Number.isFinite(f);
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._id = Collider._idGenerator++;
    Engine._physicalObjectsMap[this._id] = this;

    this._markDirty = this._markDirty.bind(this);
    this._onTransformChanged = this._onTransformChanged.bind(this);
    entity._updateFlagManager.addListener(this._onTransformChanged);
    //@ts-ignore
    this._center._onValueChanged = this._markDirty;
    //@ts-ignore
    this._rotation._onValueChanged = this._markDirty;
  }

  /**
   * Get the instance material for this Collider.
   * @remarks Clones {@link material} or creates a default {@link PhysicsMaterial} when not yet instanced, assigns it,
   * and reuses it until {@link material} is set to a different material or null.
   * @returns The Collider-specific material instance
   */
  getInstanceMaterial(): PhysicsMaterial {
    if (!this._materialInstanced) {
      this.material = this._material ? this._material.clone() : new PhysicsMaterial(this.engine);
      this._materialInstanced = true;
    }
    return this._material!;
  }

  /**
   * Get the distance and the closest point on the Collider from a point.
   * @param point - Location in world space you want to find the closest point to
   * @param outClosestPoint - The closest point on the Collider in world space
   * @returns The distance between the point and the Collider, or -1 when the Collider is not in simulation
   */
  getClosestPoint(point: Vector3, outClosestPoint: Vector3): number {
    const distance = this._getVolumeDistance(point, outClosestPoint);
    if (distance < 0) {
      console.warn("The collider is not in simulation.");
    }
    return distance;
  }

  /**
   * @internal
   * Distance from a world-space point to this Collider's active simulation shape, or -1 when unavailable.
   */
  _getVolumeDistance(point: Vector3, outClosestPoint: Vector3): number {
    this._phasedActiveInScene && this.scene!.physics._syncColliders();
    const body = this._attachedBody;
    // A disabled Rigidbody is unregistered from the scene's enabled bodies but keeps its Colliders attached
    if (!this._nativeActor || (body && body._index === -1)) {
      return -1;
    }

    const res = (<IColliderShape>this._native).pointDistance(point);
    const distance = res.w;
    if (distance < 0) {
      return -1;
    }
    if (distance > 0) {
      outClosestPoint.set(res.x, res.y, res.z);
    } else {
      outClosestPoint.copyFrom(point);
    }
    return Math.sqrt(distance);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this._markDirty();
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene!.physics._removeCollider(this);
  }

  /**
   * @internal
   * @inheritdoc
   */
  _onClone(target: Collider): void {
    // _material is @ignoreClone: assign it through the setter so the target retains its own reference.
    target.material = this._material;
  }

  /**
   * @internal
   * Reconcile native ownership and pose with the hierarchy. Called by the physics scene before simulation and queries.
   */
  _sync(): void {
    const transform = this.entity.transform;
    // Reading the world matrix re-arms transform change notifications that are only sent from a clean state
    this._checkShear(transform.worldMatrix);

    const lossyScale = transform.lossyWorldScale;
    const scale = Collider._tempScale.set(Math.abs(lossyScale.x), Math.abs(lossyScale.y), Math.abs(lossyScale.z));
    if (!this._hasValidGeometry(scale)) {
      this._detach();
      return;
    }

    const body = this._findRigidbody();
    if (body && !body.isKinematic && !this._supportsDynamicBody()) {
      if (this._rejectedBody !== body) {
        this._rejectedBody = body;
        console.error(
          `${this.constructor.name}: this geometry cannot belong to a non-kinematic Rigidbody, it is excluded from simulation until the Rigidbody is kinematic.`
        );
      }
      this._failedTransferTarget = undefined;
      this._failedTransferFallback = null;
      this._detach();
      return;
    }
    this._rejectedBody = null;

    const shape = this._syncNativeShape(scale);
    if (!shape) {
      this._detach();
      return;
    }

    const actor = body ? body._getNativeActor() : this._getStaticActor();
    let forcePose = false;
    if (this._nativeActor !== actor) {
      if (!this._transfer(body, actor)) {
        this._failedTransferTarget = body;
        this._failedTransferFallback = this._attachedBody;
        this._failedTransferStamp = Entity._nextHierarchyStamp;
        if (this._nativeActor) {
          this._syncPose(shape, this._attachedBody, scale, true);
        }
        return;
      }
      forcePose = true;
    }
    this._failedTransferTarget = undefined;
    this._failedTransferFallback = null;
    this._syncPose(shape, body, scale, forcePose);
  }

  /**
   * @internal
   * Remove the native shape from its actor. JS fields and material references are kept.
   */
  _detach(): void {
    const actor = this._nativeActor;
    if (actor) {
      actor.removeShape(<IColliderShape>this._native);
      const body = this._attachedBody;
      if (body) {
        body._detachCollider(this);
      } else {
        this.scene!.physics._nativePhysicsScene.removeCollider(actor);
      }
      this._nativeActor = null;
      this._attachedBody = null;
    }
  }

  /**
   * @internal
   * Queue this Collider for the next sync when it is in a scene.
   */
  @ignoreClone
  _markDirty(): void {
    this._phasedActiveInScene && this.scene?.physics._markColliderDirty(this);
  }

  /**
   * @internal
   * Whether this Collider can belong to a non-kinematic Rigidbody.
   */
  _supportsDynamicBody(): boolean {
    return true;
  }

  /**
   * @internal
   * Detach from the owning Rigidbody's actor before the actor is released. The Rigidbody marks this Collider dirty so
   * the next sync makes it static.
   */
  _onBodyDestroyed(): void {
    const body = this._attachedBody;
    this._nativeActor!.removeShape(<IColliderShape>this._native);
    this._nativeActor = null;
    this._attachedBody = null;
    if (this._failedTransferFallback === body) {
      this._failedTransferTarget = undefined;
      this._failedTransferFallback = null;
    }
    this._markDirty();
  }

  /**
   * @internal
   * Detach a rolled-back Collider from a Rigidbody that no longer owns it in the hierarchy when that
   * Rigidbody leaves its scene or is disabled, then queue a fresh sync in this Collider's own scene.
   */
  _onOrphanBodyUnavailable(body: Rigidbody): void {
    if (this._attachedBody === body) {
      this._detach();
    }
    if (this._failedTransferFallback === body) {
      this._failedTransferTarget = undefined;
      this._failedTransferFallback = null;
    }
    this._markDirty();
  }

  /**
   * @internal
   */
  _findRigidbody(): Rigidbody | null {
    for (let entity: Entity | null = this.entity; entity; entity = entity.parent) {
      const body = entity.getComponent(Rigidbody);
      if (body) {
        return body;
      }
    }
    return null;
  }

  /**
   * Whether the Collider produces valid native geometry under the given absolute world scale.
   */
  protected _hasValidGeometry(_scale: Vector3): boolean {
    return true;
  }

  /**
   * Push updated local geometry parameters to an existing native shape.
   */
  protected _syncGeometry(_shape: IColliderShape): void {}

  /**
   * Reconcile the native shape with current component fields before attachment and pose sync.
   * @returns The active native shape, or null when the current fields cannot produce one
   */
  protected _syncNativeShape(scale: Vector3): IColliderShape | null {
    let shape = <IColliderShape | null>this._native;
    if (!shape) {
      shape = <IColliderShape | null>(this._native = this._createNative());
      this._geometryDirty = false;
    } else if (this._geometryDirty) {
      if (!Vector3.equals(scale, this._nativeScale)) {
        this._nativeScale.copyFrom(scale);
        shape.setWorldScale(scale);
      }
      this._geometryDirty = false;
      this._syncGeometry(shape);
      this._onGeometryChanged();
    }
    return shape;
  }

  /**
   * Create the native object from the current fields. The base class has no geometry.
   * @returns The native object, or null when the current fields cannot produce one
   */
  protected _createNative(): IColliderShape | ICharacterController | null {
    return null;
  }

  /**
   * Apply the fields shared by every Collider to a newly created native shape.
   */
  protected _initializeNativeShape(shape: IColliderShape): void {
    shape.setContactOffset(this._contactOffset);
    shape.setIsTrigger(this._isTrigger);
    shape.setIsSceneQuery(this._isSceneQuery);
    shape.setCollisionLayer(this._collisionLayerIndex);
  }

  /**
   * Replace the native shape, keeping its actor registration and trigger state when attached.
   * @returns Whether the replacement was committed; on failure the new shape is released
   */
  protected _replaceNativeShape(shape: IColliderShape | null): boolean {
    const previous = <IColliderShape>this._native;
    const actor = this._nativeActor;
    if (actor) {
      if (shape) {
        const lossyScale = this.entity.transform.lossyWorldScale;
        const scale = Collider._tempScale.set(Math.abs(lossyScale.x), Math.abs(lossyScale.y), Math.abs(lossyScale.z));
        if (!this._hasValidGeometry(scale)) {
          this._detach();
        } else {
          if (!actor.replaceShape(previous, shape)) {
            shape.destroy();
            return false;
          }
          // Pose the new shape only after the replacement commits, so a failure keeps the caches of the old one
          this._syncPose(shape, this._attachedBody, scale, true);
        }
      } else {
        this._detach();
      }
    }
    this._native = shape;
    previous?.destroy();
    this._attachedBody?._markMassDirty();
    return true;
  }

  /**
   * Notify the owning Rigidbody that the attached geometry changed, so its mass properties are recomputed.
   */
  protected _onGeometryChanged(): void {
    this._attachedBody?._markMassDirty();
  }

  /**
   * Validate a contact offset assigned to {@link contactOffset}.
   * @returns The value to store, negative values are clamped to 0
   * @throws When the value is not finite.
   */
  protected _validateContactOffset(value: number): number {
    if (!Number.isFinite(value)) {
      throw new Error("Collider contactOffset must be finite.");
    }
    return Math.max(0, value);
  }

  protected _onContactOffsetChanged(value: number): void {
    this._native?.setContactOffset(value);
  }

  protected _setIsTrigger(value: boolean): void {
    if (this._isTrigger !== value) {
      this._isTrigger = value;
      (<IColliderShape>this._native)?.setIsTrigger(value);
      this._attachedBody?._markMassDirty();
    }
  }

  protected _getNativeMaterial(): IPhysicsMaterial {
    return this._material?._nativeMaterial ?? BasicResources.physicsDefaultMaterial;
  }

  private _hasHierarchyChangedSince(stamp: number): boolean {
    for (let entity: Entity | null = this.entity; entity; entity = entity.parent) {
      if (entity._hierarchyStamp > stamp) {
        return true;
      }
    }
    return false;
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this.entity._updateFlagManager.removeListener(this._onTransformChanged);
    this._native?.destroy();
    this._native = null;
    this._staticActor?.destroy();
    this._staticActor = null;
    this._material && this._addResourceReferCount(this._material, -1);
    this._material = null;
    this._rejectedBody = null;
    this._failedTransferTarget = undefined;
    this._failedTransferFallback = null;
    delete Engine._physicalObjectsMap[this._id];
  }

  @ignoreClone
  private _onTransformChanged(type: TransformModifyFlags): void {
    // A Collider attached to a Rigidbody on its own Entity shares that actor's world pose;
    // only scale or hierarchy changes (both include WorldScale) can alter its local shape.
    if (this._attachedBody?.entity === this.entity && !(type & TransformModifyFlags.WorldScale)) {
      return;
    }
    this._markDirty();
  }

  private _transfer(body: Rigidbody | null, actor: ICollider): boolean {
    const previousBody = this._attachedBody;
    const previousActor = this._nativeActor;
    this._detach();
    if (this._attach(body, actor)) {
      return true;
    }
    if (previousActor) {
      this._attach(previousBody, previousActor);
      console.error(
        `${this.constructor.name}: failed to attach to the native actor, the previous registration is kept.`
      );
    } else {
      console.error(`${this.constructor.name}: failed to attach to the native actor.`);
    }
    return false;
  }

  private _attach(body: Rigidbody | null, actor: ICollider): boolean {
    if (!actor.addShape(<IColliderShape>this._native)) {
      return false;
    }
    if (body) {
      body._attachCollider(this);
    } else {
      this.scene!.physics._nativePhysicsScene.addCollider(actor);
    }
    this._nativeActor = actor;
    this._attachedBody = body;
    return true;
  }

  private _getStaticActor(): IStaticCollider {
    let actor = this._staticActor;
    if (!actor) {
      const transform = this.entity.transform;
      const position = transform.worldPosition;
      const rotation = transform.worldRotationQuaternion;
      this._staticActor = actor = Engine._nativePhysics.createStaticCollider(position, rotation);
      this._nativeWorldPosition.copyFrom(position);
      this._nativeWorldRotation.copyFrom(rotation);
    }
    return actor;
  }

  private _syncPose(shape: IColliderShape, body: Rigidbody | null, scale: Vector3, force: boolean): void {
    const transform = this.entity.transform;
    const worldPosition = transform.worldPosition;
    const worldRotation = transform.worldRotationQuaternion;
    const position = Collider._tempPosition;
    const rotation = Collider._tempRotation;
    const localRotation = Collider._tempLocalRotation;

    const euler = this._rotation;
    Quaternion.rotationYawPitchRoll(
      MathUtil.degreeToRadian(euler.y),
      MathUtil.degreeToRadian(euler.x),
      MathUtil.degreeToRadian(euler.z),
      localRotation
    );
    Vector3.multiply(this._center, scale, position);

    if (body) {
      // Pose relative to the Rigidbody Entity: inverse(bodyRotation) * (world center - bodyPosition)
      const bodyTransform = body.entity.transform;
      const inverseBodyRotation = Collider._tempBodyRotation;
      Quaternion.invert(bodyTransform.worldRotationQuaternion, inverseBodyRotation);
      Vector3.transformByQuat(position, worldRotation, position);
      position.add(worldPosition).subtract(bodyTransform.worldPosition);
      Vector3.transformByQuat(position, inverseBodyRotation, position);
      Quaternion.multiply(inverseBodyRotation, worldRotation, rotation);
      Quaternion.multiply(rotation, localRotation, rotation);
    } else {
      rotation.copyFrom(localRotation);
      const staticActor = this._staticActor;
      if (
        staticActor &&
        (force ||
          !Vector3.equals(worldPosition, this._nativeWorldPosition) ||
          !Quaternion.equals(worldRotation, this._nativeWorldRotation))
      ) {
        this._nativeWorldPosition.copyFrom(worldPosition);
        this._nativeWorldRotation.copyFrom(worldRotation);
        staticActor.setWorldTransform(worldPosition, worldRotation);
      }
    }

    if (force || !Vector3.equals(scale, this._nativeScale)) {
      this._nativeScale.copyFrom(scale);
      shape.setWorldScale(scale);
      body?._markMassDirty();
    }
    if (
      force ||
      !Vector3.equals(position, this._nativePosition) ||
      !Quaternion.equals(rotation, this._nativeRotation)
    ) {
      this._nativePosition.copyFrom(position);
      this._nativeRotation.copyFrom(rotation);
      shape.setLocalPose(position, rotation);
      body?._markMassDirty();
    }
  }

  private _checkShear(worldMatrix: Matrix): void {
    if (this._shearWarned) {
      return;
    }
    // A rotated, non-uniformly scaled ancestor can skew the basis; a TRS pose cannot represent it
    const e = worldMatrix.elements;
    const xLength = Math.hypot(e[0], e[1], e[2]);
    const yLength = Math.hypot(e[4], e[5], e[6]);
    const zLength = Math.hypot(e[8], e[9], e[10]);
    const tolerance = Collider._shearTolerance;
    if (
      Math.abs(e[0] * e[4] + e[1] * e[5] + e[2] * e[6]) > tolerance * xLength * yLength ||
      Math.abs(e[0] * e[8] + e[1] * e[9] + e[2] * e[10]) > tolerance * xLength * zLength ||
      Math.abs(e[4] * e[8] + e[5] * e[9] + e[6] * e[10]) > tolerance * yLength * zLength
    ) {
      this._shearWarned = true;
      console.warn(
        `${this.constructor.name}: the world transform of "${this.entity.name}" is sheared, which physics cannot represent; the shape ignores the shear.`
      );
    }
  }
}
