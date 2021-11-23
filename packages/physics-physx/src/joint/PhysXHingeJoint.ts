import { PhysXCollider } from "../PhysXCollider";
import { PhysXJoint } from "./PhysXJoint";
import { IHingeJoint } from "@oasis-engine/design";
import { PhysXPhysics } from "../PhysXPhysics";
import { Quaternion, Vector3 } from "oasis-engine";

export class PhysXHingeJoint extends PhysXJoint implements IHingeJoint {
  constructor(
    actor0: PhysXCollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: PhysXCollider,
    position1: Vector3,
    rotation1: Quaternion
  ) {
    super();
    this._pxJoint = PhysXPhysics._pxPhysics.createRevoluteJoint(
      actor0?._pxActor,
      position0,
      rotation0,
      actor1?._pxActor,
      position1,
      rotation1
    );
  }

  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number) {
    // this._pxJoint.setLimit(CPxJointAngularLimitPair(hardLimit: lowerLimit, upperLimit, contactDist))
  }

  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number) {
    // this._pxJoint.setLimit(
    // CPxJointAngularLimitPair(softLimit: lowerLimit, upperLimit,
    // CPxSpring(stiffness: stiffness, damping)))
  }

  setDriveVelocity(velocity: number) {
    this._pxJoint.setDriveVelocity(velocity);
  }

  setDriveForceLimit(limit: number) {
    this._pxJoint.setDriveForceLimit(limit);
  }

  setDriveGearRatio(ratio: number) {
    this._pxJoint.setDriveGearRatio(ratio);
  }

  setRevoluteJointFlag(flag: number, value: boolean) {
    // this._pxJoint.setRevoluteJointFlag(CPxRevoluteJointFlag(UInt32(flag)), value)
  }

  setProjectionLinearTolerance(tolerance: number) {
    this._pxJoint.setProjectionLinearTolerance(tolerance);
  }

  setProjectionAngularTolerance(tolerance: number) {
    this._pxJoint.setProjectionAngularTolerance(tolerance);
  }
}
