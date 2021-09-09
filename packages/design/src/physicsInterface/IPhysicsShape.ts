import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

export interface IPhysicsShape {
  material: IPhysicsMaterial;

  setTrigger(value: boolean);

  setFlag(flag: number, value: boolean);

  setLocalPose(position: Vector3, rotation: Quaternion);
}
