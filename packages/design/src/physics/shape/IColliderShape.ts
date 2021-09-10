import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";

/** Interface for PhysXPhysics Shape */
export interface IColliderShape {
  /** local position */
  position: Vector3;

  /** local rotation */
  rotation: Quaternion;

  /** physics material on shape */
  material: IPhysicsMaterial;

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
}
