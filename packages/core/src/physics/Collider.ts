import { ICollider, IStaticCollider } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine-math";
import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { ICustomClone } from "../clone/ComponentCloner";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity } from "../Entity";
import { Layer } from "../Layer";
import { Transform } from "../Transform";
import { ColliderShape } from "./shape/ColliderShape";
import { ColliderShapeChangeFlag } from "./enums/ColliderShapeChangeFlag";

/**
 * Base class for all colliders.
 * @decorator `@dependentComponents(Transform, DependentMode.CheckOnly)`
 */
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Collider extends Component implements ICustomClone {
  /** @internal */
  @ignoreClone
  _index: number = -1;
  /** @internal */
  @ignoreClone
  _nativeCollider: ICollider;
  @ignoreClone
  protected _updateFlag: BoolUpdateFlag;
  @deepClone
  protected _shapes: ColliderShape[] = [];
  protected _collisionLayerIndex: number = 0;

  /**
   * The shapes of this collider.
   */
  get shapes(): Readonly<ColliderShape[]> {
    return this._shapes;
  }

  /**
   * The collision layer of this collider, only support single layer.
   *
   * @defaultValue `Layer.Layer0`
   */
  get collisionLayer(): Layer {
    return (1 << this._collisionLayerIndex) as Layer;
  }

  set collisionLayer(value: Layer) {
    // Check if value is a single layer (power of 2)
    const index = Math.log2(value);
    if (!Number.isInteger(index)) {
      throw new Error("Collision layer must be a single layer (Layer.Layer0 to Layer.Layer31)");
    }

    this._collisionLayerIndex = index;
    this._nativeCollider.setCollisionLayer(index);
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._updateFlag = entity.registerWorldChangeFlag();
  }

  /**
   * Add collider shape on this collider.
   * @param shape - Collider shape
   */
  addShape(shape: ColliderShape): void {
    const oldCollider = shape._collider;
    if (oldCollider !== this) {
      if (oldCollider) {
        oldCollider.removeShape(shape);
      }
      this._shapes.push(shape);
      this._addNativeShape(shape);
      this._handleShapesChanged(ColliderShapeChangeFlag.Count);
    }
  }

  /**
   * Remove a collider shape.
   * @param shape - The collider shape.
   */
  removeShape(shape: ColliderShape): void {
    const index = this._shapes.indexOf(shape);
    if (index !== -1) {
      this._shapes.splice(index, 1);
      this._removeNativeShape(shape);
      this._handleShapesChanged(ColliderShapeChangeFlag.Count);
    }
  }

  /**
   * Remove all shape attached.
   */
  clearShapes(): void {
    const shapes = this._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      this._removeNativeShape(shapes[i]);
    }
    shapes.length = 0;
    this._handleShapesChanged(ColliderShapeChangeFlag.Count);
  }

  /**
   * @internal
   */
  _onUpdate(): void {
    const shapes = this._shapes;
    if (this._updateFlag.flag) {
      const { transform } = this.entity;
      this._syncEntityTransformToNative(transform.worldPosition, transform.worldRotationQuaternion);

      const worldScale = transform.lossyWorldScale;
      for (let i = 0, n = shapes.length; i < n; i++) {
        shapes[i]._nativeShape?.setWorldScale(worldScale);
      }
      this._updateFlag.flag = false;
    }

    // Drive per-shape physics update (e.g. MeshColliderShape retries pending
    // native shape creation when mesh data becomes accessible asynchronously).
    // No-op for shape types that don't override `_onPhysicsUpdate`.
    for (let i = 0, n = shapes.length; i < n; i++) {
      shapes[i]._onPhysicsUpdate();
    }
  }

  /**
   * @internal
   */
  _onLateUpdate(): void {}

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this.scene.physics._addCollider(this);
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene.physics._removeCollider(this);
  }

  /**
   * @internal
   */
  _cloneTo(target: Collider): void {
    target._syncNative();
  }

  /**
   * @internal
   */
  _handleShapesChanged(changeType: ColliderShapeChangeFlag): void {
    if (changeType & ColliderShapeChangeFlag.Count) {
      this._setCollisionLayer();
    }
  }

  protected _syncNative(): void {
    for (let i = 0, n = this.shapes.length; i < n; i++) {
      this._addNativeShape(this.shapes[i]);
    }
    this._setCollisionLayer();
    // Teleport native actor to entity's current world pose.
    // The native actor was created in constructor() with the entity's then-current
    // worldPosition/Rotation. On clone, the entity's transform fields are deep-cloned
    // AFTER the Component (and its native actor) are constructed, so the native actor's
    // pose lags behind the cloned entity transform until this sync.
    const { transform } = this.entity;
    this._teleportToEntityTransform(transform.worldPosition, transform.worldRotationQuaternion);
  }

  /**
   * Teleport native actor to a world pose (instant, no implied velocity).
   * Used during initialization paths (clone) where the native actor must be re-aligned
   * with the entity transform after construction-time pose was based on stale defaults.
   */
  protected _teleportToEntityTransform(worldPosition: Vector3, worldRotation: Quaternion): void {
    (<IStaticCollider>this._nativeCollider).setWorldTransform(worldPosition, worldRotation);
  }

  /**
   * Sync entity world transform to native actor for per-frame updates.
   * Default semantics: teleport (setGlobalPose). Subclasses override to express
   * physics-aware movement (e.g. DynamicCollider routes kinematic actors through
   * setKinematicTarget to generate contact events on swept motion).
   */
  protected _syncEntityTransformToNative(worldPosition: Vector3, worldRotation: Quaternion): void {
    (<IStaticCollider>this._nativeCollider).setWorldTransform(worldPosition, worldRotation);
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    const shapes = this._shapes;
    for (let i = 0, n = shapes.length; i < n; i++) {
      const shape = shapes[i];
      this._removeNativeShape(shape);
      shape._destroy();
    }
    shapes.length = 0;
    this._nativeCollider.destroy();
  }

  protected _addNativeShape(shape: ColliderShape): void {
    shape._collider = this;
    if (shape._nativeShape) {
      shape._nativeShape.setWorldScale(this.entity.transform.lossyWorldScale);
      this._nativeCollider.addShape(shape._nativeShape);
    }
  }

  protected _removeNativeShape(shape: ColliderShape): void {
    shape._collider = null;
    if (shape._nativeShape) {
      this._nativeCollider.removeShape(shape._nativeShape);
    }
  }

  private _setCollisionLayer(): void {
    this._nativeCollider.setCollisionLayer(this._collisionLayerIndex);
  }
}
