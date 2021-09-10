import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

/** Interface for Physics Shape */
export interface IPhysicsShape {
  /** physics material on shape */
  material: IPhysicsMaterial;

  /** shape property flags */
  shapeFlags: number;

  isTrigger(value: boolean);

  isSceneQuery(value: boolean);

  setLocalPose(position: Vector3, rotation: Quaternion);
}
