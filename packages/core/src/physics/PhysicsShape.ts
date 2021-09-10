import { IPhysicsShape } from "@oasis-engine/design";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/** Abstract class for collision shapes. */
export abstract class PhysicsShape {
  /** @internal */
  _shape: IPhysicsShape;

  /** Physics Material */
  get material(): PhysicsMaterial {
    return new PhysicsMaterial(this._shape.material);
  }

  set material(value: PhysicsMaterial) {
    this._shape.material = value._physicsMaterial;
  }

  /** Shape Property Flags */
  get shapeFlags(): number {
    return this._shape.shapeFlags;
  }

  set shapeFlags(flags: number) {
    this._shape.shapeFlags = flags;
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
   * Set Local Pose for the Shape
   * @param position local position
   * @param rotation local rotation
   */
  setLocalPose(position: Vector3, rotation: Quaternion) {
    this._shape.setLocalPose(position, rotation);
  }

  /**
   * initialization internal physics shape object
   * @param index index of shape
   */
  abstract init(index: number);
}
