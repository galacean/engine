import { Quaternion, Vector3 } from "oasis-engine";
import { ISphericalJoint } from "@oasis-engine/design";
import { PhysXJoint } from "./PhysXJoint";
import { PhysXCollider } from "../PhysXCollider";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * A joint which behaves in a similar way to a ball and socket.
 */
export class PhysXSphericalJoint extends PhysXJoint implements ISphericalJoint {
  constructor(
    actor0: PhysXCollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: PhysXCollider,
    position1: Vector3,
    rotation1: Quaternion
  ) {
    super();
    this._pxJoint = PhysXPhysics._pxPhysics.createSphericalJoint(
      actor0?._pxActor,
      position0,
      rotation0,
      actor1?._pxActor,
      position1,
      rotation1
    );
  }

  /**
   * {@inheritDoc ISphericalJoint.setHardLimitCone }
   */
  setHardLimitCone(yLimitAngle: number, zLimitAngle: number, contactDist: number): void {
    this._pxJoint.setHardLimitCone(yLimitAngle, zLimitAngle, contactDist);
  }

  /**
   * {@inheritDoc ISphericalJoint.setSoftLimitCone }
   */
  setSoftLimitCone(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number): void {
    this._pxJoint.setSoftLimitCone(yLimitAngle, zLimitAngle, stiffness, damping);
  }

  /**
   * {@inheritDoc ISphericalJoint.setSphericalJointFlag }
   */
  setSphericalJointFlag(flag: number, value: boolean): void {
    this._pxJoint.setSphericalJointFlag(new PhysXPhysics._physX.PxSphericalJointFlag(flag), value);
  }

  /**
   * {@inheritDoc ISphericalJoint.setProjectionLinearTolerance }
   */
  setProjectionLinearTolerance(tolerance: number): void {
    this._pxJoint.setProjectionLinearTolerance(tolerance);
  }
}
