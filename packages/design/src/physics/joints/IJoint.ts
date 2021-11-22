import { Vector3, Quaternion } from "@oasis-engine/math";
import { ICollider } from "../ICollider";

export interface IJoint {
  setActors(actor0?: ICollider, actor1?: ICollider): void;

  setLocalPose(actor: number, position: Vector3, rotation: Quaternion): void;

  setBreakForce(force: number, torque: number): void;

  setConstraintFlag(flags: number, value: boolean): void;

  setInvMassScale0(invMassScale: number): void;

  setInvInertiaScale0(invInertiaScale: number): void;

  setInvMassScale1(invMassScale: number): void;

  setInvInertiaScale1(invInertiaScale: number): void;
}
