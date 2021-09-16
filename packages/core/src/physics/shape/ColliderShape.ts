import { IColliderShape } from "@oasis-engine/design";
import { PhysicsMaterial } from "../PhysicsMaterial";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ignoreClone } from "../../clone/CloneManager";
import { Collider } from "../Collider";

/**
 * Abstract class for collider shapes.
 */
export abstract class ColliderShape {
  static idGenerator: number = 0;

  /** @internal */
  _collider: Collider;
  /** @internal */
  @ignoreClone
  _index: number = -1;
  /** @internal */
  _nativeShape: IColliderShape;

  protected _id: number;
  protected _position: Vector3 = new Vector3();
  protected _rotation: Quaternion = new Quaternion();
  protected _material: PhysicsMaterial;

  /**
   * collider owner of this shape.
   */
  get collider(): Collider {
    return this._collider;
  }

  /**
   * unique id for this shape.
   */
  get id(): number {
    return this._id;
  }

  /**
   * physical material.
   */
  get material(): PhysicsMaterial {
    return this._material;
  }

  set material(value: PhysicsMaterial) {
    this._material = value;
    this._nativeShape.setMaterial(value._nativeMaterial);
  }

  /**
   * The local position of this ColliderShape.
   */
  get position(): Vector3 {
    return this._position;
  }

  set position(value: Vector3) {
    this._position = value;
    this._nativeShape.setPosition(value);
  }

  /**
   * The local rotation of this ColliderShape.
   */
  get rotation(): Quaternion {
    return this._rotation;
  }

  set rotation(value: Quaternion) {
    this._rotation = value;
    this._nativeShape.setRotation(value);
  }

  protected constructor() {
    this._material = new PhysicsMaterial();
    this._id = ColliderShape.idGenerator++;
  }

  /**
   * Set Trigger or not
   * @param value true for TriggerShape, false for SimulationShape
   */
  isTrigger(value: boolean) {
    this._nativeShape.isTrigger(value);
  }

  /**
   * Set Scene Query or not
   * @param value true for Query, false for not Query
   */
  isSceneQuery(value: boolean) {
    this._nativeShape.isSceneQuery(value);
  }
}
