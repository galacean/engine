import { IJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";

export class PhysXJoint implements IJoint {
  /** @internal */
  _pxJoint: any;

  setActors(actor0?: PhysXCollider, actor1?: PhysXCollider) {
    this._pxJoint.setActors(actor1?._pxActor, actor1?._pxActor);
  }

  setLocalPose(actor: number, position: Vector3, rotation: Quaternion) {
    // this._pxJoint.setLocalPose(CPxJointActorIndex(UInt32(actor)), position, rotation);
  }

  setBreakForce(force: number, torque: number) {
    this._pxJoint.setBreakForce(force, torque);
  }

  setConstraintFlag(flags: number, value: boolean) {
    // this._pxJoint.setConstraintFlag(CPxConstraintFlag(UInt32(flags)), value);
  }

  setInvMassScale0(invMassScale: number) {
    this._pxJoint.setInvMassScale0(invMassScale);
  }

  setInvInertiaScale0(invInertiaScale: number) {
    this._pxJoint.setInvInertiaScale0(invInertiaScale);
  }

  setInvMassScale1(invMassScale: number) {
    this._pxJoint.setInvMassScale1(invMassScale);
  }

  setInvInertiaScale1(invInertiaScale: number) {
    this._pxJoint.setInvInertiaScale1(invInertiaScale);
  }
}