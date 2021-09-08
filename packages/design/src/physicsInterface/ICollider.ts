import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

export interface ICollider {
  center: Vector3;
  material: IPhysicsMaterial;

  setTrigger(value: boolean);

  setFlag(flag: number, value: boolean);

  setGlobalPose(position: Vector3, rotation: Quaternion);
}
