import { IColliderShape } from "@galacean/engine-design";
import { PhysicsMaterial } from "../PhysicsMaterial";
import { Vector3 } from "@galacean/engine-math";
import { Collider } from "../Collider";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ICustomClone } from "../../clone/ComponentCloner";
import { Engine } from "../../Engine";

/**
 * Abstract class for collider shapes.
 */
export abstract class ColliderShape implements ICustomClone {
  private static _idGenerator: number = 0;

  /** @internal */
  @ignoreClone
  _collider: Collider;
  /** @internal */
  @ignoreClone
  _nativeShape: IColliderShape;

  @ignoreClone
  protected _id: number;
  protected _material: PhysicsMaterial;
  private _isTrigger: boolean = false;
  @deepClone
  private _rotation: Vector3 = new Vector3();
  @deepClone
  private _position: Vector3 = new Vector3();
  private _contactOffset: number = 0.02;

  /**
   * @internal
   * @beta
   * Whether raycast can select it.
   */
  isSceneQuery: boolean = true;

  /**
   * Collider owner of this shape.
   */
  get collider(): Collider {
    return this._collider;
  }

  /**
   * Unique id for this shape.
   */
  get id(): number {
    return this._id;
  }

  /**
   * Contact offset for this shape, the value must be greater than or equal to 0.
   */
  get contactOffset(): number {
    return this._contactOffset;
  }

  set contactOffset(value: number) {
    value = Math.max(0, value);
    if (this._contactOffset !== value) {
      this._contactOffset = value;
      this._nativeShape.setContactOffset(value);
    }
  }

  /**
   * Physical material.
   */
  get material(): PhysicsMaterial {
    return this._material;
  }

  set material(value: PhysicsMaterial) {
    if (this._material !== value) {
      this._material = value;
      this._nativeShape.setMaterial(value._nativeMaterial);
    }
  }

  /**
   * The local rotation of this ColliderShape.
   */
  get rotation(): Vector3 {
    return this._rotation;
  }

  set rotation(value: Vector3) {
    if (this._rotation != value) {
      this._rotation.copyFrom(value);
    }
  }

  /**
   * The local position of this ColliderShape.
   */
  get position(): Vector3 {
    return this._position;
  }

  set position(value: Vector3) {
    if (this._position !== value) {
      this._position.copyFrom(value);
    }
  }

  /**
   * True for TriggerShape, false for SimulationShape.
   */
  get isTrigger(): boolean {
    return this._isTrigger;
  }

  set isTrigger(value: boolean) {
    if (this._isTrigger !== value) {
      this._isTrigger = value;
      this._nativeShape.setIsTrigger(value);
    }
  }

  protected constructor() {
    this._material = new PhysicsMaterial();
    this._id = ColliderShape._idGenerator++;

    this._setRotation = this._setRotation.bind(this);
    this._setPosition = this._setPosition.bind(this);
    //@ts-ignore
    this._rotation._onValueChanged = this._setRotation;
    //@ts-ignore
    this._position._onValueChanged = this._setPosition;

    Engine._physicalObjectsMap[this._id] = this;
  }

  /**
   * @internal
   */
  _cloneTo(target: ColliderShape) {
    target._syncNative();
  }

  /**
   * @internal
   */
  _destroy() {
    this._nativeShape.destroy();
    this._nativeShape = null;
    delete Engine._physicalObjectsMap[this._id];
  }

  protected _syncNative(): void {
    this._nativeShape.setPosition(this._position);
    this._nativeShape.setRotation(this._rotation);
    this._nativeShape.setContactOffset(this._contactOffset);
    this._nativeShape.setIsTrigger(this._isTrigger);
    this._nativeShape.setMaterial(this._material._nativeMaterial);

    this._collider?._handleShapesChanged();
  }

  @ignoreClone
  private _setPosition(): void {
    this._nativeShape.setPosition(this._position);
    this._collider?._handleShapesChanged();
  }

  @ignoreClone
  private _setRotation(): void {
    this._nativeShape.setRotation(this._rotation);
    this._collider?._handleShapesChanged();
  }
}
