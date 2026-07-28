import { ICollider, IStaticCollider } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine-math";
import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { ignoreClone } from "../clone/CloneDecorators";
import type { ICloneHook } from "../clone/ICloneHook";
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
export class Collider extends Component implements ICloneHook<Collider> {
  /** @internal */
  @ignoreClone
  _index: number = -1;
  /** @internal */
  @ignoreClone
  _nativeCollider: ICollider;
  protected _updateFlag: BoolUpdateFlag;
  protected _shapes: ColliderShape[] = [];
  protected _collisionLayerIndex: number = 0;

  /**
   * A collider must teleport on the next transform sync when its native actor
   * already exists at a stale pose, such as after re-entering the scene or after
   * clone-time native reconstruction. Ordinary first entry can use subclass sync
   * semantics so kinematic actors still use setKinematicTarget.
   */
  @ignoreClone
  private _pendingReenterTeleport: boolean = false;
  @ignoreClone
  private _enteredScene: boolean = false;

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
      this._addNativeShape(shape);
      this._shapes.push(shape);
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
    if (this._pendingReenterTeleport || this._updateFlag.flag) {
      const { transform } = this.entity;
      if (this._pendingReenterTeleport) {
        this._teleportToEntityTransform(transform.worldPosition, transform.worldRotationQuaternion);
        this._pendingReenterTeleport = false;
      } else {
        this._syncEntityTransformToNative(transform.worldPosition, transform.worldRotationQuaternion);
      }

      const worldScale = transform.lossyWorldScale;
      for (let i = 0, n = shapes.length; i < n; i++) {
        shapes[i]._nativeShape?.setWorldScale(worldScale);
      }
      this._updateFlag.flag = false;
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
    if (this._enteredScene) {
      this._pendingReenterTeleport = true;
    }
    this._enteredScene = true;
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene.physics._removeCollider(this);
  }

  /**
   * @inheritdoc
   */
  _onClone(target: Collider): void {
    target._syncNative();
    target._pendingReenterTeleport = true;
  }

  /**
   * @internal
   */
  _handleShapesChanged(changeType: ColliderShapeChangeFlag): void {
    if (changeType & ColliderShapeChangeFlag.Count) {
      this._setCollisionLayer();
    }
  }

  /**
   * @internal
   */
  _setNativeShapeAttached(shape: ColliderShape, attached: boolean): void {
    const nativeShape = shape._nativeShape;
    if (nativeShape && shape._isShapeAttached !== attached) {
      if (attached) {
        nativeShape.setWorldScale(this.entity.transform.lossyWorldScale);
        this._nativeCollider.addShape(nativeShape);
      } else {
        this._nativeCollider.removeShape(nativeShape);
      }
      shape._isShapeAttached = attached;
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
    this._setNativeShapeAttached(shape, true);
    shape._collider = this;
  }

  protected _removeNativeShape(shape: ColliderShape): void {
    this._setNativeShapeAttached(shape, false);
    shape._collider = null;
  }

  private _setCollisionLayer(): void {
    this._nativeCollider.setCollisionLayer(this._collisionLayerIndex);
  }
}
