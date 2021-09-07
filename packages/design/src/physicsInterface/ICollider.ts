import { Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "./IPhysicsMaterial";

export interface ICollider {
  center: Vector3;
  material: IPhysicsMaterial;

  getGroup_id(): number;

  setTrigger(value: boolean);

  setFlag(flag: number, value: boolean);
}
