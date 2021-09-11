import { IColliderShape } from "@oasis-engine/design";
import { PhysicsMaterial } from "../PhysicsMaterial";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/** Abstract class for collision shapes. */
export abstract class ColliderShape {
  static idGenerator: number = 0;

  /** @internal */
  _nativeShape: IColliderShape;

  protected _id: number;
  protected _position: Vector3 = new Vector3();
  protected _rotation: Quaternion = new Quaternion();
  protected _material: PhysicsMaterial;

  get id(): number {
    return this._id;
  }

  /** PhysXPhysics Material */
  get material(): PhysicsMaterial {
    return this._material;
  }

  set material(value: PhysicsMaterial) {
    this._material = value;
    this._nativeShape.setMaterial(value._nativeMaterial);
  }

  /** The position of this ColliderShape. */
  get position(): Vector3 {
    return this._position;
  }

  set position(value: Vector3) {
    this._position = value;
    this._nativeShape.setPosition(value);
  }

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
