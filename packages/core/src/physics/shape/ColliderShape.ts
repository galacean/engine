import { IColliderShape } from "@oasis-engine/design";
import { PhysicsMaterial } from "../PhysicsMaterial";
import { Vector3 } from "@oasis-engine/math";
import { Collider } from "../Collider";

/**
 * Abstract class for collider shapes.
 */
export abstract class ColliderShape {
  private static _idGenerator: number = 0;

  /** @internal */
  _collider: Collider;
  /** @internal */
  _nativeShape: IColliderShape;

  protected _id: number;
  protected _position: Vector3 = new Vector3();
  protected _material: PhysicsMaterial;
  protected _isTrigger: boolean = false;
  protected _isSceneQuery: boolean = true;
  private _contactOffset: number = 0;
  private _rotation: Vector3 = new Vector3();

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
   * Contact offset for this shape.
   */
  get contactOffset() {
    return this._contactOffset;
  }

  set contactOffset(value: number) {
    this._contactOffset = value;
    this._nativeShape.setContactOffset(value);
  }

  /**
   * Physical material.
   */
  get material(): PhysicsMaterial {
    return this._material;
  }

  set material(value: PhysicsMaterial) {
    this._material = value;
    this._nativeShape.setMaterial(value._nativeMaterial);
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
    this._nativeShape.setRotation(value);
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
    this._nativeShape.setPosition(value);
  }

  /**
   * True for TriggerShape, false for SimulationShape.
   */
  get isTrigger(): boolean {
    return this._isTrigger;
  }

  set isTrigger(value: boolean) {
    this._isTrigger = value;
    this._nativeShape.setIsTrigger(value);
  }

  protected constructor() {
    this._material = new PhysicsMaterial();
    this._id = ColliderShape._idGenerator++;
  }

  /**
   * Set local position of collider shape
   * @param x - The x component of the vector, default 0
   * @param y - The y component of the vector, default 0
   * @param z - The z component of the vector, default 0
   */
  setPosition(x: number, y: number, z: number): void {
    this._position.set(x, y, z);
    this._nativeShape.setPosition(this._position);
  }

  /**
   * Set the local rotation of collider shape
   * @param x - Radian of yaw
   * @param y - Radian of pitch
   * @param z - Radian of roll
   */
  setRotation(x: number, y: number, z: number): void {
    this._rotation.set(x, y, z);
    this._nativeShape.setRotation(this._rotation);
  }

  /**
   * @internal
   */
  _destroy() {
    this._material._destroy();
    this._nativeShape.destroy();
  }
}
