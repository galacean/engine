import { IJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";

/**
 * a base interface providing common functionality for PhysX joints
 */
export class PhysXJoint implements IJoint {
  /** @internal */
  _pxJoint: any;

  /**
   * {@inheritDoc IJoint.setActors }
   */
  setActors(actor0?: PhysXCollider, actor1?: PhysXCollider): void {
    this._pxJoint.setActors(actor1?._pxActor, actor1?._pxActor);
  }

  /**
   * {@inheritDoc IJoint.setLocalPose }
   */
  setLocalPose(actor: number, position: Vector3, rotation: Quaternion): void {
    this._pxJoint.setLocalPose(actor, position, rotation);
  }

  /**
   * {@inheritDoc IJoint.setBreakForce }
   */
  setBreakForce(force: number, torque: number): void {
    this._pxJoint.setBreakForce(force, torque);
  }

  /**
   * {@inheritDoc IJoint.setConstraintFlag }
   */
  setConstraintFlag(flags: number, value: boolean): void {
    this._pxJoint.setConstraintFlag(flags, value);
  }

  /**
   * {@inheritDoc IJoint.setInvMassScale0 }
   */
  setInvMassScale0(invMassScale: number): void {
    this._pxJoint.setInvMassScale0(invMassScale);
  }

  /**
   * {@inheritDoc IJoint.setInvInertiaScale0 }
   */
  setInvInertiaScale0(invInertiaScale: number): void {
    this._pxJoint.setInvInertiaScale0(invInertiaScale);
  }

  /**
   * {@inheritDoc IJoint.setInvMassScale1 }
   */
  setInvMassScale1(invMassScale: number): void {
    this._pxJoint.setInvMassScale1(invMassScale);
  }

  /**
   * {@inheritDoc IJoint.setInvInertiaScale1 }
   */
  setInvInertiaScale1(invInertiaScale: number): void {
    this._pxJoint.setInvInertiaScale1(invInertiaScale);
  }
}
