import {
  ICharacterController,
  IPhysicsActor,
  IPhysicsMaterial,
  IPhysicsShape,
  IStaticActor
} from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine-math";
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
import { differsF32, rotationDiffersF32 } from "./float32";
import { warnIfColliderSheared } from "./shearWarning";

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
  private static readonly _tempPosition = new Vector3();
  private static readonly _tempBodyOffset = new Vector3();
  private static readonly _tempRotation = new Quaternion();
  private static readonly _tempInverseBodyRotation = new Quaternion();
  private static readonly _tempScale = new Vector3();

  /**
   * @internal
   * @returns The index of a single collision layer
   * @throws When the value is not exactly one of `Layer.Layer0` to `Layer.Layer31`.
   */
  static _getLayerIndex(layer: Layer): number {
    const index = 31 - Math.clz32(layer);
    if (index < 0 || (1 << index) >>> 0 !== layer) {
      throw new Error("Collision layer must be a single layer (Layer.Layer0 to Layer.Layer31)");
    }
    return index;
  }

  /** @internal */
  @ignoreClone
  _id: number;
  /** @internal */
  @ignoreClone
  _dirtyIndex = -1;
  /** @internal The Rigidbody whose native actor holds the shape. */
  @ignoreClone
  _attachedBody: Rigidbody | null = null;

  /** The native shape, created from the current fields when first needed. */
  @ignoreClone
  protected _native: IPhysicsShape | null = null;
  @ignoreClone
  protected _registeredScene: Scene | null = null;
  /** Index of the single collision layer. */
  protected _collisionLayerIndex = 0;
  @ignoreClone
  protected _geometryDirty = false;
  @ignoreClone
  protected _nativeScale = new Vector3(1, 1, 1);
  @ignoreClone
  protected readonly _nativePosition = new Vector3();
  protected _isTrigger = false;

  @ignoreClone
  private _poseOnlyDirty = false;
  @ignoreClone
  private _nativeActor: IPhysicsActor | null = null;
  @ignoreClone
  private _staticActor: IStaticActor | null = null;
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
  private _contactOffset = 0.02;
  @ignoreClone
  private _material: PhysicsMaterial | null = null;

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
    this._center !== value && this._center.copyFrom(value);
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
   * The contact offset in world units. Ordinary colliders clamp finite negative values to 0.
   * @defaultValue 0.02
   * @throws When the value is non-finite or overflows Float32, or when a CharacterController receives a non-positive value.
   */
  get contactOffset(): number {
    return this._contactOffset;
  }

  set contactOffset(value: number) {
    value = this._validateContactOffset(value);
    if (this._contactOffset !== value) {
      this._contactOffset = value;
      this._getNative()?.setContactOffset(value);
    }
  }

  /**
   * The assigned material, or null to use the shared default material.
   * @defaultValue null
   * @remarks Retains an assigned material until replaced or the Collider is destroyed.
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
      this._material && this._addResourceReferCount(this._material, -1);
      value && this._addResourceReferCount(value, 1);
      this._material = value;
      this._getNative()?.setMaterial(this._getNativeMaterial());
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
      this._getNative()?.setCollisionLayer(index);
    }
  }

  /**
   * @internal
   * @throws When physics is not initialized on the Engine.
   */
  constructor(entity: Entity) {
    if (!entity.engine._physicsInitialized) {
      throw new Error("Physics is not initialized on this Engine.");
    }
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
   * Finds the closest point in this Collider's volume.
   * @param point - Point to measure from in world space.
   * @param outClosestPoint - Receives the closest point in world space. Left unchanged if the query fails.
   * @returns Distance in world units, 0 for a point inside or on the Collider, or -1 if the shape is unavailable.
   */
  getClosestPoint(point: Vector3, outClosestPoint: Vector3): number {
    this._registeredScene?.physics._syncColliders(false);
    const distance = this._getVolumeDistance(point, outClosestPoint);
    distance < 0 && console.warn("The collider is not in simulation.");
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
    // A disabled Rigidbody is unregistered from the scene's enabled bodies but keeps its Colliders attached
    if (!this._nativeActor || this._attachedBody?._index === -1) {
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
    this._registeredScene = this.scene!;
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
    if (poseOnly) {
      this._syncShapePose(this._native!, this._attachedBody, transform.lossyWorldScale, false);
      return;
    }

    if (Logger.isEnabled && !this._shearWarned) {
      this._shearWarned = warnIfColliderSheared(worldMatrix, this);
    }

    const lossyScale = transform.lossyWorldScale;
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
    this._nativeActor && this._attachedBody !== body && this._detach();

    const scale = Collider._tempScale.set(Math.abs(lossyScale.x), Math.abs(lossyScale.y), Math.abs(lossyScale.z));
    const previousShape = this._native;
    const shape = this._syncNativeShape(scale);
    if (!shape) {
      this._detach();
      return;
    }

    const attachedActor = this._nativeActor;
    const actor = body ? (attachedActor ?? body._getNativeActor()) : this._syncStaticActor(transform);
    const replaced = shape !== previousShape;
    this._syncShapePose(shape, body, lossyScale, replaced);
    if (!attachedActor) {
      actor.addShape(shape);
      if (body) {
        body._attachCollider(this);
      } else {
        scene.physics._nativePhysicsScene.addActor(actor);
      }
      this._nativeActor = actor;
      this._attachedBody = body;
    } else if (replaced) {
      actor.replaceShape(previousShape!, shape);
    }
    if (replaced) {
      this._native = shape;
      previousShape?.destroy();
    }
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
        (physicsScene ?? this._registeredScene!.physics)._nativePhysicsScene.removeActor(actor);
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
   * Whether this Collider's declared configuration can belong to a non-kinematic Rigidbody.
   */
  protected _supportsDynamicBody(): boolean {
    return true;
  }

  /**
   * Apply the final scaled geometry, or create the shape when absent.
   * @returns The shape, or null when the geometry is invalid or unsupported.
   */
  protected _syncGeometry(_shape: IPhysicsShape | null, _scale: Vector3): IPhysicsShape | null {
    return null;
  }

  /**
   * Reconcile the native shape with current component fields before attachment and pose sync.
   * @returns The active native shape, or null when the current fields cannot produce one
   */
  protected _syncNativeShape(scale: Vector3): IPhysicsShape | null {
    const previous = this._native;
    if (previous && !this._geometryDirty && !this._scaleChanged(scale)) {
      return previous;
    }
    const shape = this._syncGeometry(previous, scale);
    if (shape) {
      shape !== previous && this._initializeNativeShape(shape);
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
  protected _initializeNativeShape<T extends IPhysicsShape>(shape: T): T {
    shape.setContactOffset(this._contactOffset);
    this._isTrigger && shape.setIsTrigger(true);
    shape.setCollisionLayer(this._collisionLayerIndex);
    return shape;
  }

  /**
   * Validate a contact offset assigned to {@link contactOffset}.
   * @returns The value to store, negative values are clamped to 0
   * @throws When the value is not finite or overflows Float32.
   */
  protected _validateContactOffset(value: number): number {
    const clamped = Math.max(0, value);
    if (!Number.isFinite(value) || !Number.isFinite(Math.fround(clamped))) {
      throw new Error("Collider contactOffset must be finite within Float32 range.");
    }
    return clamped;
  }

  protected _getNative(): IPhysicsShape | ICharacterController | null {
    return this._native;
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
    // Without a scale or hierarchy change, keep any pending sync level and skip world-pose updates on the body's own Entity.
    if (!(type & TransformModifyFlags.WorldScale)) {
      if (this._dirtyIndex !== -1 || this._attachedBody?.entity === this.entity) {
        return;
      }
      if (this._attachedBody && !this._geometryDirty) {
        const scene = this._registeredScene;
        if (scene) {
          this._poseOnlyDirty = true;
          scene.physics._markColliderDirty(this);
        }
        return;
      }
    }
    this._markDirty();
  }

  private _syncStaticActor(transform: Transform): IStaticActor {
    const position = transform.worldPosition;
    const rotation = transform.worldRotationQuaternion;
    let actor = this._staticActor;
    if (!actor) {
      this._staticActor = actor = Engine._nativePhysics.createStaticActor(position, rotation);
      this._nativeWorldPosition = position.clone();
      this._nativeWorldRotation = rotation.clone();
      return actor;
    }
    const nativePosition = this._nativeWorldPosition;
    const nativeRotation = this._nativeWorldRotation;
    if (differsF32(position, nativePosition) || rotationDiffersF32(rotation, nativeRotation)) {
      actor.setWorldTransform(position, rotation);
      nativePosition.copyFrom(position);
      nativeRotation.copyFrom(rotation);
    }
    return actor;
  }

  private _syncShapePose(shape: IPhysicsShape, body: Rigidbody | null, scale: Vector3, force: boolean): void {
    const position = Collider._tempPosition;
    const rotation = Collider._tempRotation.set(0, 0, 0, 1);
    Vector3.multiply(this._center, scale, position);

    if (body) {
      const entity = this.entity;
      const bodyEntity = body.entity;
      entity !== bodyEntity && this._transformPoseToBodySpace(entity, bodyEntity, position, rotation);
    }

    const nativePosition = this._nativePosition;
    const nativeRotation = this._nativeRotation;
    if (force || differsF32(position, nativePosition) || rotationDiffersF32(rotation, nativeRotation)) {
      nativePosition.copyFrom(position);
      (this._nativeRotation ||= new Quaternion()).copyFrom(rotation);
      shape.setLocalPose(position, rotation);
      this._attachedBody?._markMassDirty();
    }
  }

  private _transformPoseToBodySpace(entity: Entity, body: Entity, position: Vector3, rotation: Quaternion): void {
    // Accumulate the child origin and rotation in the body's local frame, where rigid body motion cancels out.
    const offset = Collider._tempBodyOffset.set(0, 0, 0);
    for (let current = entity; current !== body; current = current.parent!) {
      const transform = current.transform;
      Vector3.transformToVec3(offset, transform.localMatrix, offset);
      Quaternion.multiply(transform.rotationQuaternion, rotation, rotation);
    }
    const bodyTransform = body.transform;
    const parent = body.parent;
    if (parent && !parent.transform._getWorldUniformScaling()) {
      // Inherited shear still affects the child origin even though the native shape ignores shear.
      const inverseRotation = Collider._tempInverseBodyRotation;
      Quaternion.invert(bodyTransform.worldRotationQuaternion, inverseRotation);
      Vector3.transformNormal(offset, bodyTransform.worldMatrix, offset);
      Vector3.transformByQuat(offset, inverseRotation, offset);
    } else {
      Vector3.multiply(offset, bodyTransform.lossyWorldScale, offset);
    }
    Vector3.transformByQuat(position, rotation, position);
    position.add(offset);
  }
}
