import { ICollider, IColliderShape, IPhysicsMaterial, IStaticCollider } from "@galacean/engine-design";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { Logger } from "../base";
import { BasicResources } from "../BasicResources";
import { ignoreClone } from "../clone/CloneDecorators";
import type { ICloneHook } from "../clone/ICloneHook";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { Layer } from "../Layer";
import type { Scene } from "../Scene";
import { Transform, TransformModifyFlags } from "../Transform";
import { PhysicsMaterial } from "./PhysicsMaterial";
import type { PhysicsScene } from "./PhysicsScene";
import { Rigidbody } from "./Rigidbody";

class ColliderSyncScratch {
  readonly position = new Vector3();
  readonly bodyOffset = new Vector3();
  readonly rotation = new Quaternion();
  readonly inverseBodyRotation = new Quaternion();
  readonly scale = new Vector3();
}

/**
 * A collision shape attached to an Entity.
 * @remarks The nearest {@link Rigidbody} on the Entity or its ancestors owns the shape. With no owner, it is static
 * and follows its Entity's transform. A disabled owner keeps its shapes out of simulation and queries.
 * {@link CharacterController} moves independently of Rigidbody ownership.
 *
 * On PhysX, transferring a Collider to another actor preserves trigger pairs that still overlap on the next step
 * and reports `onTriggerExit` for pairs that separate. Continuing contacts start a new collision pair.
 * @decorator `@dependentComponents(Transform, DependentMode.CheckOnly)`
 */
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Collider extends Component implements ICloneHook<Collider> {
  private static _idGenerator = 0;
  private static readonly _syncScratch: ColliderSyncScratch[] = [new ColliderSyncScratch()];
  private static readonly _shearToleranceSquared = 1e-8;

  /**
   * @internal
   * Compare positions submitted directly as native Float32 vectors.
   */
  static _differsF32(a: Vector3, b: Vector3): boolean {
    return (
      Collider._componentDiffersF32(a.x, b.x) ||
      Collider._componentDiffersF32(a.y, b.y) ||
      Collider._componentDiffersF32(a.z, b.z)
    );
  }

  /** @internal */
  static _rotationDiffersF32(a: Quaternion, b: Quaternion): boolean {
    return (
      Collider._componentDiffersF32(a.x, b.x) ||
      Collider._componentDiffersF32(a.y, b.y) ||
      Collider._componentDiffersF32(a.z, b.z) ||
      Collider._componentDiffersF32(a.w, b.w)
    );
  }

  private static _componentDiffersF32(a: number, b: number): boolean {
    return a !== b && Math.fround(a) !== Math.fround(b);
  }

  /**
   * @internal
   * Normalize a unit direction vector in place, restoring its prior valid direction on invalid input.
   * @returns Whether the resulting direction changed relative to the previous valid value.
   */
  static _syncUnitVector(
    target: Vector3,
    source: Vector3,
    lastValid: Vector3 | undefined,
    defaultX: number,
    defaultY: number,
    defaultZ: number,
    errorMessage: string
  ): boolean {
    const prevX = lastValid?.x ?? defaultX;
    const prevY = lastValid?.y ?? defaultY;
    const prevZ = lastValid?.z ?? defaultZ;
    let { x, y, z } = source;
    const length = Math.hypot(x, y, z);
    const finite = Number.isFinite(length);
    if (!finite || length === 0) {
      if (source === target) {
        Collider._writeVectorUnchecked(target, prevX, prevY, prevZ);
      }
      if (!finite) {
        throw new Error(errorMessage);
      }
      return false;
    }
    x /= length;
    y /= length;
    z /= length;
    Collider._writeVectorUnchecked(target, x, y, z);
    return x !== prevX || y !== prevY || z !== prevZ;
  }

  private static _writeVectorUnchecked(target: Vector3, x: number, y: number, z: number): void {
    if (target.x === x && target.y === y && target.z === z) return;
    //@ts-ignore
    const listener = target._onValueChanged;
    //@ts-ignore
    target._onValueChanged = null;
    target.set(x, y, z);
    //@ts-ignore
    target._onValueChanged = listener;
  }

  /** @internal */
  @ignoreClone
  _id: number;
  /** @internal The native shape, created from the current fields when first needed. */
  @ignoreClone
  _native: IColliderShape | null = null;
  /** @internal */
  @ignoreClone
  _dirtyIndex = -1;
  /** @internal The Rigidbody whose native actor holds the shape. */
  @ignoreClone
  _attachedBody: Rigidbody | null = null;
  @ignoreClone
  protected _registeredScene: Scene | null = null;

  /** Index of the single collision layer. */
  protected _collisionLayerIndex = 0;
  @ignoreClone
  protected _geometryDirty = false;
  @ignoreClone
  private _poseOnlyDirty = false;
  @ignoreClone
  private _poseScale = new Vector3(1, 1, 1);
  @ignoreClone
  protected _nativeScale = new Vector3(1, 1, 1);
  @ignoreClone
  protected readonly _nativePosition = new Vector3();

  @ignoreClone
  private _nativeActor: ICollider | null = null;
  @ignoreClone
  private _staticActor: IStaticCollider | null = null;
  @ignoreClone
  private _rejectedBody: Rigidbody | null = null;
  @ignoreClone
  private _shearWarned = false;
  @ignoreClone
  private _nativeRotation: Quaternion;
  @ignoreClone
  private _nativeWorldPosition: Vector3;
  @ignoreClone
  private _nativeWorldRotation: Quaternion;

  private _center = new Vector3();
  protected _isTrigger = false;
  private _isSceneQuery = true;
  private _contactOffset = 0.02;
  @ignoreClone
  private _material: PhysicsMaterial | null = null;
  @ignoreClone
  private _materialInstanced = false;

  /**
   * The owning Rigidbody, even if disabled, or null if there is no owner.
   */
  get attachedRigidbody(): Rigidbody | null {
    if (this._dirtyIndex === -1 && this._nativeActor) {
      return this._attachedBody;
    }
    return this._findRigidbody();
  }

  /**
   * The center of the Collider in the Entity's local space.
   * @remarks Scaled by the Entity's signed world scale, so negative scaling mirrors the offset.
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
   * Whether raycasts, shape casts, and overlap queries can find this Collider. Simulation uses its collision flags
   * independently.
   */
  get isSceneQuery(): boolean {
    return this._isSceneQuery;
  }

  /** @internal @beta */
  set isSceneQuery(value: boolean) {
    if (this._isSceneQuery !== value) {
      this._isSceneQuery = value;
      this._onIsSceneQueryChanged(value);
    }
  }

  /**
   * The contact offset in world units. Ordinary colliders clamp finite negative values to 0.
   * @defaultValue 0.02
   * @throws When the value is non-finite, or when a CharacterController receives a non-positive value.
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
      this._onMaterialChanged(this._getNativeMaterial());
    }
  }

  /**
   * The Collider's single collision layer, used for simulation filtering and scene queries.
   * @defaultValue `Layer.Layer0`
   * @remarks On PhysX, pairs that still pass the collision matrix continue, and trigger pairs that fail it exit.
   * @throws When assigned a value other than one of `Layer.Layer0` through `Layer.Layer31`.
   */
  get collisionLayer(): Layer {
    // Unsigned shift keeps Layer31 positive
    return ((1 << this._collisionLayerIndex) >>> 0) as Layer;
  }

  set collisionLayer(value: Layer) {
    const index = Collider._getLayerIndex(value);
    if (this._collisionLayerIndex !== index) {
      this._collisionLayerIndex = index;
      this._onCollisionLayerChanged(index);
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
  }

  /**
   * Returns a material instance for this Collider.
   * @remarks The first call clones the assigned {@link material} or creates a default material, then assigns the
   * instance to this Collider. Later calls reuse it until the material changes.
   */
  getInstanceMaterial(): PhysicsMaterial {
    if (!this._materialInstanced) {
      this.material = this._material ? this._material.clone() : new PhysicsMaterial(this.engine);
      this._materialInstanced = true;
    }
    return this._material!;
  }

  /**
   * Finds the closest point in this Collider's volume.
   * @param point - Point to measure from in world space.
   * @param outClosestPoint - Receives the closest point in world space. Left unchanged if the query fails.
   * @returns Distance in world units, 0 for a point inside or on the Collider, or -1 if the shape is unavailable.
   */
  getClosestPoint(point: Vector3, outClosestPoint: Vector3): number {
    this._registeredScene?.physics._syncColliders();
    const distance = this._getVolumeDistance(point, outClosestPoint);
    if (distance < 0) {
      console.warn("The collider is not in simulation.");
    }
    return distance;
  }

  /**
   * @internal
   * Measures the distance to this Collider's synchronized native shape.
   * @param point - The point in world space
   * @param outClosestPoint - Receives the closest point in world space when available
   * @returns The distance, or -1 when the shape is unavailable
   */
  _getVolumeDistance(point: Vector3, outClosestPoint?: Vector3): number {
    const body = this._attachedBody;
    // A disabled Rigidbody is unregistered from the scene's enabled bodies but keeps its Colliders attached
    if (!this._nativeActor || (body && body._index === -1)) {
      return -1;
    }

    const res = this._native!.pointDistance(point);
    const distance = res.w;
    if (distance < 0) {
      return -1;
    }
    if (outClosestPoint) {
      if (distance > 0) {
        outClosestPoint.set(res.x, res.y, res.z);
      } else {
        outClosestPoint.copyFrom(point);
      }
    }
    return Math.sqrt(distance);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this._registeredScene = this.scene ?? null;
    this._markDirty();
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    const scene = this._registeredScene;
    if (!scene) return;
    this._registeredScene = null;
    scene.physics._removeCollider(this);
  }

  /**
   * @internal
   * @inheritDoc
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
    const scene = this._registeredScene!;
    const poseOnly = this._poseOnlyDirty;
    this._poseOnlyDirty = false;
    const transform = this.entity.transform;
    // Reading the world matrix re-arms transform change notifications that are only sent from a clean state
    const worldMatrix = transform.worldMatrix;
    if (
      poseOnly &&
      this._nativeActor &&
      this._attachedBody &&
      !this._attachedBody.destroyed &&
      !this._geometryDirty &&
      this._native &&
      this._registeredScene === scene
    ) {
      const scratch = Collider._syncScratch.pop() ?? new ColliderSyncScratch();
      scratch.scale.copyFrom(this._poseScale);
      this._syncShapePose(this._native, this._attachedBody, scratch, false, scene);
      Collider._syncScratch.push(scratch);
      return;
    }

    if (Logger.isEnabled && !this._shearWarned) this._checkShear(worldMatrix);

    const lossyScale = transform.lossyWorldScale;
    if (this._registeredScene !== scene) return;
    const body = this._findRigidbody();
    if (body && !body.isKinematic && !this._supportsDynamicBody()) {
      if (this._rejectedBody !== body) {
        this._rejectedBody = body;
        console.error(
          `${this.constructor.name}: this geometry cannot belong to a non-kinematic Rigidbody, it is excluded from simulation until the Rigidbody is kinematic.`
        );
      }
      this._detach();
      return;
    }
    this._rejectedBody = null;

    // Replace geometry only on the actor that owns this Collider in the current hierarchy.
    if (this._nativeActor && this._attachedBody !== body) {
      this._detach();
    }

    // Transform accessors can query the scene and synchronize other Colliders before this pose is committed.
    const scaleX = lossyScale.x;
    const scaleY = lossyScale.y;
    const scaleZ = lossyScale.z;
    const scratch = Collider._syncScratch.pop() ?? new ColliderSyncScratch();
    const scale = scratch.scale.set(Math.abs(scaleX), Math.abs(scaleY), Math.abs(scaleZ));
    const previousShape = this._native;
    const shape = this._syncNativeShape(scale);
    if (!shape) {
      Collider._syncScratch.push(scratch);
      this._detach();
      return;
    }
    scale.set(scaleX, scaleY, scaleZ);

    const attachedActor = this._nativeActor;
    const actor = body ? (attachedActor ?? body._getNativeActor()) : this._syncStaticActor(transform, scene);
    if (actor && this._syncShapePose(shape, body, scratch, shape !== previousShape, scene)) {
      if (!this._nativeActor) {
        if (!body || (!body.destroyed && this._findRigidbody() === body)) {
          if (actor.addShape(shape)) {
            if (body) {
              body._attachCollider(this);
            } else {
              scene.physics._nativePhysicsScene.addCollider(actor);
            }
            this._nativeActor = actor;
            this._attachedBody = body;
            this._poseScale.copyFrom(scale);
          } else {
            console.error(`${this.constructor.name}: failed to attach to the native actor.`);
          }
        }
      } else {
        this._poseScale.copyFrom(scale);
      }
    }
    Collider._syncScratch.push(scratch);
  }

  /**
   * @internal
   * Remove the native shape from its actor. JS fields and material references are kept.
   */
  _detach(physicsScene?: PhysicsScene): void {
    const actor = this._nativeActor;
    if (actor) {
      actor.removeShape(this._native!);
      const body = this._attachedBody;
      if (body) {
        body._detachCollider(this);
      } else {
        (physicsScene ?? this._registeredScene!.physics)._nativePhysicsScene.removeCollider(actor);
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
    this._poseOnlyDirty = false;
    this._registeredScene?.physics._markColliderDirty(this);
  }

  /**
   * @internal
   * Whether this Collider's declared configuration can belong to a non-kinematic Rigidbody.
   */
  _supportsDynamicBody(): boolean {
    return true;
  }

  /**
   * @internal
   * Whether the currently attached native shape can belong to a non-kinematic Rigidbody.
   */
  _nativeSupportsDynamicBody(): boolean {
    return this._supportsDynamicBody();
  }

  /**
   * @internal
   * Detach before the Rigidbody releases its actor so the next sync can resolve the new owner.
   */
  _onBodyDestroyed(): void {
    this._nativeActor!.removeShape(this._native!);
    this._nativeActor = null;
    this._attachedBody = null;
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
   * Apply the final scaled geometry, or create the shape when absent.
   * @returns The shape, or null when the geometry is invalid or unsupported.
   */
  protected _syncGeometry(_shape: IColliderShape | null, _scale: Vector3): IColliderShape | null {
    return null;
  }

  /**
   * Reconcile the native shape with current component fields before attachment and pose sync.
   * @returns The active native shape, or null when the current fields cannot produce one
   */
  protected _syncNativeShape(scale: Vector3): IColliderShape | null {
    const previous = this._native;
    if (previous && !this._geometryDirty && !this._scaleChanged(scale)) {
      return previous;
    }
    const shape = this._syncGeometry(previous, scale);
    if (shape) {
      if (!previous) {
        this._native = this._initializeNativeShape(shape);
      }
      this._nativeScale.copyFrom(scale);
      this._geometryDirty = false;
      this._attachedBody?._markMassDirty();
    }
    return shape;
  }

  protected _scaleChanged(scale: Vector3): boolean {
    const nativeScale = this._nativeScale;
    return scale.x !== nativeScale.x || scale.y !== nativeScale.y || scale.z !== nativeScale.z;
  }

  /**
   * Apply the fields shared by every Collider to a newly created native shape.
   */
  protected _initializeNativeShape<T extends IColliderShape>(shape: T): T {
    shape.setContactOffset(this._contactOffset);
    if (this._isTrigger) shape.setIsTrigger(true);
    if (!this._isSceneQuery) shape.setIsSceneQuery(false);
    shape.setCollisionLayer(this._collisionLayerIndex);
    return shape;
  }

  /**
   * Replace the native shape, keeping its actor registration and trigger state when attached.
   * @returns Whether the replacement was committed; on failure the new shape is released
   */
  protected _replaceNativeShape(shape: IColliderShape | null): boolean {
    const previous = this._native!;
    const actor = this._nativeActor;
    if (actor) {
      if (!shape) {
        this._detach();
      } else if (!actor.replaceShape(previous, shape)) {
        shape.destroy();
        return false;
      }
    }
    this._native = shape;
    previous?.destroy();
    return true;
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

  protected _onIsSceneQueryChanged(value: boolean): void {
    this._native?.setIsSceneQuery(value);
  }

  protected _onMaterialChanged(material: IPhysicsMaterial): void {
    this._native?.setMaterial(material);
  }

  protected _onCollisionLayerChanged(layerIndex: number): void {
    this._native?.setCollisionLayer(layerIndex);
  }

  protected _destroyNative(): void {
    this._native?.destroy();
    this._native = null;
  }

  protected _setIsTrigger(value: boolean): void {
    if (this._isTrigger !== value) {
      this._isTrigger = value;
      this._native?.setIsTrigger(value);
      this._attachedBody?._markMassDirty();
    }
  }

  protected _getNativeMaterial(): IPhysicsMaterial {
    return this._material?._nativeMaterial ?? BasicResources.physicsDefaultMaterial;
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    //@ts-ignore
    this._center._onValueChanged = null;
    super._onDestroy();
    this.entity._updateFlagManager.removeListener(this._onTransformChanged);
    this._destroyNative();
    this._staticActor?.destroy();
    this._staticActor = null;
    this._material && this._addResourceReferCount(this._material, -1);
    this._material = null;
    this._rejectedBody = null;
    delete Engine._physicalObjectsMap[this._id];
  }

  @ignoreClone
  private _onTransformChanged(type: TransformModifyFlags): void {
    // A Collider attached to a Rigidbody on its own Entity shares that actor's world pose;
    // only scale or hierarchy changes (both include WorldScale) can alter its local shape.
    if (this._attachedBody?.entity === this.entity && !(type & TransformModifyFlags.WorldScale)) {
      return;
    }
    if (
      !(type & TransformModifyFlags.WorldScale) &&
      this._dirtyIndex === -1 &&
      this._nativeActor &&
      this._attachedBody &&
      !this._geometryDirty
    ) {
      const scene = this._registeredScene;
      if (scene) {
        this._poseOnlyDirty = true;
        scene.physics._markColliderDirty(this);
      }
      return;
    }
    this._markDirty();
  }

  private _syncStaticActor(transform: Transform, scene: Scene): IStaticCollider | null {
    const position = transform.worldPosition;
    const rotation = transform.worldRotationQuaternion;
    if (this._registeredScene !== scene) return null;
    let actor = this._staticActor;
    if (!actor) {
      this._staticActor = actor = Engine._nativePhysics.createStaticCollider(position, rotation);
      this._nativeWorldPosition = position.clone();
      this._nativeWorldRotation = rotation.clone();
      return actor;
    }
    const nativePosition = this._nativeWorldPosition;
    const nativeRotation = this._nativeWorldRotation;
    if (Collider._differsF32(position, nativePosition) || Collider._rotationDiffersF32(rotation, nativeRotation)) {
      actor.setWorldTransform(position, rotation);
      nativePosition.copyFrom(position);
      nativeRotation.copyFrom(rotation);
    }
    return actor;
  }

  private _syncShapePose(
    shape: IColliderShape,
    body: Rigidbody | null,
    scratch: ColliderSyncScratch,
    force: boolean,
    scene: Scene
  ): boolean {
    const { position, rotation, scale } = scratch;
    rotation.set(0, 0, 0, 1);
    Vector3.multiply(this._center, scale, position);

    if (body) {
      const entity = this.entity;
      const bodyEntity = body.entity;
      if (entity !== bodyEntity) {
        this._transformPoseToBodySpace(entity, bodyEntity, scratch);
      }
    }

    // Custom Transform accessors can unregister the collider before its pose is ready to commit.
    if (this._registeredScene !== scene || this._native !== shape) return false;
    const nativePosition = this._nativePosition;
    const nativeRotation = this._nativeRotation;
    if (
      force ||
      !nativeRotation ||
      Collider._differsF32(position, nativePosition) ||
      Collider._rotationDiffersF32(rotation, nativeRotation)
    ) {
      nativePosition.copyFrom(position);
      (this._nativeRotation ||= new Quaternion()).copyFrom(rotation);
      shape.setLocalPose(position, rotation);
      this._attachedBody?._markMassDirty();
    }
    return true;
  }

  private _transformPoseToBodySpace(entity: Entity, body: Entity, scratch: ColliderSyncScratch): void {
    // Accumulate the child origin and rotation in the body's local frame, where rigid body motion cancels out.
    const { position, rotation, bodyOffset: offset } = scratch;
    offset.set(0, 0, 0);
    for (let current = entity; current !== body; current = current.parent!) {
      const transform = current.transform;
      Vector3.transformToVec3(offset, transform.localMatrix, offset);
      Quaternion.multiply(transform.rotationQuaternion, rotation, rotation);
    }
    const bodyTransform = body.transform;
    const parent = body.parent;
    if (parent && !parent.transform._getWorldUniformScaling()) {
      // Inherited shear still affects the child origin even though the native shape ignores shear.
      const inverseRotation = scratch.inverseBodyRotation;
      Quaternion.invert(bodyTransform.worldRotationQuaternion, inverseRotation);
      Vector3.transformNormal(offset, bodyTransform.worldMatrix, offset);
      Vector3.transformByQuat(offset, inverseRotation, offset);
    } else {
      Vector3.multiply(offset, bodyTransform.lossyWorldScale, offset);
    }
    Vector3.transformByQuat(position, rotation, position);
    position.add(offset);
  }

  private _checkShear(worldMatrix: Matrix): void {
    // A rotated, non-uniformly scaled ancestor can skew the basis; a TRS pose cannot represent it
    const e = worldMatrix.elements;
    const xLengthSquared = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
    const yLengthSquared = e[4] * e[4] + e[5] * e[5] + e[6] * e[6];
    const zLengthSquared = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
    const xy = e[0] * e[4] + e[1] * e[5] + e[2] * e[6];
    const xz = e[0] * e[8] + e[1] * e[9] + e[2] * e[10];
    const yz = e[4] * e[8] + e[5] * e[9] + e[6] * e[10];
    const tolerance = Collider._shearToleranceSquared;
    if (
      xy * xy > tolerance * xLengthSquared * yLengthSquared ||
      xz * xz > tolerance * xLengthSquared * zLengthSquared ||
      yz * yz > tolerance * yLengthSquared * zLengthSquared
    ) {
      this._shearWarned = true;
      Logger.warn(
        `${this.constructor.name}: the world transform of "${this.entity.name}" is sheared, which physics cannot represent; the shape ignores the shear.`
      );
    }
  }
}
