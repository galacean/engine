import { ICollider, IStaticCollider } from "@galacean/engine-design";
import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { Component } from "../Component";
import { DependentMode, dependentComponents } from "../ComponentsDependencies";
import { Entity } from "../Entity";
import { Transform } from "../Transform";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { ColliderShape } from "./shape/ColliderShape";
import { ICustomClone } from "../clone/ComponentCloner";
import { EntityModifyFlags } from "../enums/EntityModifyFlags";
import { Layer } from "../Layer";

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
  protected _collisionGroup: number;
  protected _syncCollisionGroupByLayer = true;

  /**
   * The shapes of this collider.
   */
  get shapes(): Readonly<ColliderShape[]> {
    return this._shapes;
  }

  get syncCollisionGroupByLayer(): boolean {
    return this._syncCollisionGroupByLayer;
  }

  set syncCollisionGroupByLayer(value: boolean) {
    if (this._syncCollisionGroupByLayer !== value) {
      this._syncCollisionGroupByLayer = value;
      if (value) {
        this._setCollisionGroupByLayer(this.entity.layer);
        this.entity._registerModifyListener(this._onEntityModified);
      } else {
        this.entity._unRegisterModifyListener(this._onEntityModified);
      }
    }
  }

  /**
   * The collision group of this collider, only support 0-31.
   */
  get collisionGroup(): number {
    return this._collisionGroup;
  }

  set collisionGroup(value: number) {
    if (value < 0 || value > 31) {
      throw new Error("Collision group must be between 0 and 31");
    }
    if (this._syncCollisionGroupByLayer) {
      console.warn(
        "Collision group is synced with layer, you can set syncCollisionGroupByLayer to false, and set collisionGroup manually"
      );
    } else {
      this._collisionGroup = value;
      this._nativeCollider.setCollisionGroup(value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._updateFlag = entity.registerWorldChangeFlag();
    this._onEntityModified = this._onEntityModified.bind(this);
    entity._registerModifyListener(this._onEntityModified);
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
   */
  _handleShapesChanged(): void {
    this._setCollisionGroup();
  }

  protected _syncNative(): void {
    for (let i = 0, n = this.shapes.length; i < n; i++) {
      this._addNativeShape(this.shapes[i]);
    }
    this._setCollisionGroupByLayer(this.collisionGroup);
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
    this.entity._unRegisterModifyListener(this._onEntityModified);
  }

  protected _addNativeShape(shape: ColliderShape): void {
    shape._collider = this;
    this._nativeCollider.addShape(shape._nativeShape);
  }

  protected _removeNativeShape(shape: ColliderShape): void {
    shape._collider = null;
    this._nativeCollider.removeShape(shape._nativeShape);
  }

  protected _setCollisionGroupByLayer(layer: Layer): void {
    if (layer === Layer.Nothing) {
      // Only support 0-31, 32 will skip collision check
      this._collisionGroup = 32;
      return;
    }

    if ((layer & (layer - 1)) !== 0) {
      console.warn(
        "Combined layers are not supported for collision groups, you can set syncCollisionGroupByLayer to false, and set collisionGroup manually"
      );
      return;
    }

    let newGroup = Math.log2(layer);
    if (newGroup !== this._collisionGroup) {
      this._collisionGroup = newGroup;
      this._setCollisionGroup();
    }
  }

  @ignoreClone
  protected _onEntityModified(flag: EntityModifyFlags): void {
    if (flag & EntityModifyFlags.Layer) {
      this._setCollisionGroupByLayer(this.entity.layer);
    }
  }

  protected _setCollisionGroup(): void {
    this._nativeCollider.setCollisionGroup(this.collisionGroup);
  }
}
