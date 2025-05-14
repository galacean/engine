import { ICollider, IStaticCollider } from "@galacean/engine-design";
import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { ICustomClone } from "../clone/ComponentCloner";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity } from "../Entity";
import { Layer } from "../Layer";
import { Transform } from "../Transform";
import { ColliderShape } from "./shape/ColliderShape";

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
      this._handleShapesChanged();
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
      this._handleShapesChanged();
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
    this._handleShapesChanged();
  }

  /**
   * @internal
   */
  _onUpdate(): void {
    if (this._updateFlag.flag) {
      const { transform } = this.entity;
      (<IStaticCollider>this._nativeCollider).setWorldTransform(
        transform.worldPosition,
        transform.worldRotationQuaternion
      );

      const worldScale = transform.lossyWorldScale;
      for (let i = 0, n = this.shapes.length; i < n; i++) {
        this.shapes[i]._nativeShape.setWorldScale(worldScale);
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
   * @remarks
   * When shapes are updated, we need to reset the collision layer because the underlying PhysX
   * will call the shape methods when setting the collision layer.
   */
  _handleShapesChanged(): void {
    this._setCollisionLayer();
  }

  protected _syncNative(): void {
    for (let i = 0, n = this.shapes.length; i < n; i++) {
      this._addNativeShape(this.shapes[i]);
    }
    this._setCollisionLayer();
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
    this._nativeCollider.addShape(shape._nativeShape);
  }

  protected _removeNativeShape(shape: ColliderShape): void {
    shape._collider = null;
    this._nativeCollider.removeShape(shape._nativeShape);
  }

  private _setCollisionLayer(): void {
    this._nativeCollider.setCollisionLayer(this._collisionLayerIndex);
  }
}
