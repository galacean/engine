import { ISphericalJoint } from "@oasis-engine/design";
import { PhysXJoint } from "./PhysXJoint";
import { PhysXCollider } from "../PhysXCollider";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * A joint which behaves in a similar way to a ball and socket.
 */
export class PhysXSphericalJoint extends PhysXJoint implements ISphericalJoint {
  constructor(collider: PhysXCollider) {
    super();
    this._collider = collider;
    this._pxJoint = PhysXPhysics._pxPhysics.createSphericalJoint(
      null,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat,
      collider._pxActor,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat
    );
  }

  /**
   * {@inheritDoc ISphericalJoint.setHardLimitCone }
   */
  setHardLimitCone(yLimitAngle: number, zLimitAngle: number, contactDist: number) {
    this._pxJoint.setHardLimitCone(yLimitAngle, zLimitAngle, contactDist);
  }

  /**
   * {@inheritDoc ISphericalJoint.setSoftLimitCone }
   */
  setSoftLimitCone(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number) {
    this._pxJoint.setSoftLimitCone(yLimitAngle, zLimitAngle, stiffness, damping);
  }
}
