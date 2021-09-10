import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

/** Interface for Physics Shape */
export interface IPhysicsShape {
  /** physics material on shape */
  material: IPhysicsMaterial;

  /** shape property flags */
  shapeFlags: number;

  /**
   * Set Trigger or not
   * @param value true for TriggerShape, false for SimulationShape
   */
  isTrigger(value: boolean);

  /**
   * Set Scene Query or not
   * @param value true for Query, false for not Query
   */
  isSceneQuery(value: boolean);

  /**
   * Set Local Pose for the Shape
   * @param position local position
   * @param rotation local rotation
   */
  setLocalPose(position: Vector3, rotation: Quaternion);
}
