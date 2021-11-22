import { Vector3, Quaternion } from "@oasis-engine/math";
import { ICollider } from "../ICollider";

export interface IJoint {
  setActors(actor0?: ICollider, actor1?: ICollider);

  setLocalPose(actor: number, position: Vector3, rotation: Quaternion);

  setBreakForce(force: number, torque: number);

  setConstraintFlag(flags: number, value: boolean);

  setInvMassScale0(invMassScale: number);

  setInvInertiaScale0(invInertiaScale: number);

  setInvMassScale1(invMassScale: number);

  setInvInertiaScale1(invInertiaScale: number);
}
