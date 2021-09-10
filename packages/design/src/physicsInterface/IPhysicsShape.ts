import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

export interface IPhysicsShape {
  material: IPhysicsMaterial;

  setTrigger(value: boolean);

  setSceneQuery(value: boolean);

  setFlags(flags: number);

  setLocalPose(position: Vector3, rotation: Quaternion);
}
