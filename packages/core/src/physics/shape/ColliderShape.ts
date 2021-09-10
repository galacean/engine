import { IColliderShape } from "@oasis-engine/design";
import { PhysicsMaterial } from "../PhysicsMaterial";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/** Abstract class for collision shapes. */
export abstract class ColliderShape {
  /** @internal */
  _shape: IColliderShape;

  /** PhysXPhysics Material */
  get material(): PhysicsMaterial {
    return new PhysicsMaterial(this._shape.material);
  }

  set material(value: PhysicsMaterial) {
    this._shape.material = value._physicsMaterial;
  }

  /** The position of this ColliderShape. */
  get position(): Vector3 {
    return this._shape.position;
  }

  set position(value: Vector3) {
    this._shape.position = value;
  }

  get rotation(): Quaternion {
    return this._shape.rotation;
  }

  set rotation(value: Quaternion) {
    this._shape.rotation = value;
  }

  /**
   * Set Trigger or not
   * @param value true for TriggerShape, false for SimulationShape
   */
  isTrigger(value: boolean) {
    this._shape.isTrigger(value);
  }

  /**
   * Set Scene Query or not
   * @param value true for Query, false for not Query
   */
  isSceneQuery(value: boolean) {
    this._shape.isSceneQuery(value);
  }

  /**
   * initialization internal physics shape object
   * @param index index of shape
   */
  abstract init(index: number);
}
