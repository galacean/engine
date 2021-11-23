import { Quaternion, Vector3 } from "oasis-engine";
import { ISphericalJoint } from "@oasis-engine/design";
import { PhysXJoint } from "./PhysXJoint";
import { PhysXCollider } from "../PhysXCollider";
import { PhysXPhysics } from "../PhysXPhysics";

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

  setHardLimitCone(yLimitAngle: number, zLimitAngle: number, contactDist: number) {
    //this._pxJoint.setLimitCone(CPxJointLimitCone(hardLimit: yLimitAngle, zLimitAngle, contactDist))
  }

  setSoftLimitCone(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number) {
    //this._pxJoint.setLimitCone(
    // CPxJointLimitCone(softLimit: yLimitAngle, zLimitAngle,
    // CPxSpring(stiffness: stiffness, damping)))
  }

  setSphericalJointFlag(flag: number, value: boolean) {
    //this._pxJoint.setSphericalJointFlag(CPxSphericalJointFlag(UInt32(flag)), value)
  }

  setProjectionLinearTolerance(tolerance: number) {
    this._pxJoint.setProjectionLinearTolerance(tolerance);
  }
}
