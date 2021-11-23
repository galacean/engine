import { IJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * a base interface providing common functionality for PhysX joints
 */
export class PhysXJoint implements IJoint {
  /** @internal */
  _pxJoint: any;

  /**
   * {@inheritDoc IJoint.setActors }
   */
  setActors(actor0?: PhysXCollider, actor1?: PhysXCollider) {
    this._pxJoint.setActors(actor1?._pxActor, actor1?._pxActor);
  }

  /**
   * {@inheritDoc IJoint.setLocalPose }
   */
  setLocalPose(actor: number, position: Vector3, rotation: Quaternion) {
    this._pxJoint.setLocalPose(new PhysXPhysics._physX.PxJointActorIndex(actor), position, rotation);
  }

  /**
   * {@inheritDoc IJoint.setBreakForce }
   */
  setBreakForce(force: number, torque: number) {
    this._pxJoint.setBreakForce(force, torque);
  }

  /**
   * {@inheritDoc IJoint.setConstraintFlag }
   */
  setConstraintFlag(flags: number, value: boolean) {
    this._pxJoint.setConstraintFlag(new PhysXPhysics._physX.PxConstraintFlag(flags), value);
  }

  /**
   * {@inheritDoc IJoint.setInvMassScale0 }
   */
  setInvMassScale0(invMassScale: number) {
    this._pxJoint.setInvMassScale0(invMassScale);
  }

  /**
   * {@inheritDoc IJoint.setInvInertiaScale0 }
   */
  setInvInertiaScale0(invInertiaScale: number) {
    this._pxJoint.setInvInertiaScale0(invInertiaScale);
  }

  /**
   * {@inheritDoc IJoint.setInvMassScale1 }
   */
  setInvMassScale1(invMassScale: number) {
    this._pxJoint.setInvMassScale1(invMassScale);
  }

  /**
   * {@inheritDoc IJoint.setInvInertiaScale1 }
   */
  setInvInertiaScale1(invInertiaScale: number) {
    this._pxJoint.setInvInertiaScale1(invInertiaScale);
  }
}
