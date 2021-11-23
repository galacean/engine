import { PhysXJoint } from "./PhysXJoint";
import { IConfigurableJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";
import { PhysXPhysics } from "../PhysXPhysics";

export class PhysXConfigurableJoint extends PhysXJoint implements IConfigurableJoint {
  constructor(
    actor0: PhysXCollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: PhysXCollider,
    position1: Vector3,
    rotation1: Quaternion
  ) {
    super();
    this._pxJoint = PhysXPhysics._pxPhysics.createD6Joint(
      actor0?._pxActor,
      position0,
      rotation0,
      actor1?._pxActor,
      position1,
      rotation1
    );
  }

  setMotion(axis: number, type: number) {
    // this._pxJoint.setMotion(CPxD6Axis(UInt32(axis)), CPxD6Motion(UInt32(type)))
  }

  setHardDistanceLimit(extent: number, contactDist: number) {
    // this._pxJoint.setDistanceLimit(CPxJointLinearLimit(hardLimit: CPxTolerancesScale.new(), extent, contactDist))
  }

  setSoftDistanceLimit(extent: number, stiffness: number, damping: number) {
    // this._pxJoint.setDistanceLimit(CPxJointLinearLimit(softLimit: extent,
    //   CPxSpring(stiffness: stiffness, damping)))
  }

  setHardLinearLimit(axis: number, lowerLimit: number, upperLimit: number, contactDist: number) {
    // this._pxJoint.setLinearLimit(CPxD6Axis(UInt32(axis)),
    //   CPxJointLinearLimitPair(hardLimit: CPxTolerancesScale.new(),
    //   lowerLimit, upperLimit, contactDist))
  }

  setSoftLinearLimit(axis: number, lowerLimit: number, upperLimit: number, stiffness: number, damping: number) {
    // this._pxJoint.setLinearLimit(CPxD6Axis(UInt32(axis)),
    //  CPxJointLinearLimitPair(softLimit: lowerLimit, upperLimit,
    //  CPxSpring(stiffness: stiffness, damping)))
  }

  setHardTwistLimit(lowerLimit: number, upperLimit: number, contactDist: number) {
    // this._pxJoint.setTwistLimit(CPxJointAngularLimitPair(hardLimit: lowerLimit, upperLimit, contactDist))
  }

  setSoftTwistLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number) {
    // this._pxJoint.setTwistLimit(CPxJointAngularLimitPair(softLimit: lowerLimit, upperLimit,
    //  CPxSpring(stiffness: stiffness, damping)))
  }

  setHardSwingLimit(yLimitAngle: number, zLimitAngle: number, contactDist: number) {
    // this._pxJoint.setSwingLimit(CPxJointLimitCone(hardLimit: yLimitAngle, zLimitAngle, contactDist))
  }

  setSoftSwingLimit(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number) {
    // this._pxJoint.setSwingLimit(CPxJointLimitCone(softLimit: yLimitAngle, zLimitAngle,
    //  CPxSpring(stiffness: stiffness, damping)))
  }

  setHardPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    contactDist: number
  ) {
    // this._pxJoint.setPyramidSwingLimit(CPxJointLimitPyramid(hardLimit: yLimitAngleMin, yLimitAngleMax,
    //  zLimitAngleMin, zLimitAngleMax, contactDist))
  }

  setSoftPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    stiffness: number,
    damping: number
  ) {
    // this._pxJoint.setPyramidSwingLimit(CPxJointLimitPyramid(softLimit: yLimitAngleMin, yLimitAngleMax,
    //   zLimitAngleMin, zLimitAngleMax, CPxSpring(stiffness: stiffness, damping)))
  }

  setDrive(index: number, driveStiffness: number, driveDamping: number, driveForceLimit: number) {
    // this._pxJoint.setDrive(CPxD6Drive(UInt32(index)),
    //  CPxD6JointDrive(limitStiffness: driveStiffness, driveDamping, driveForceLimit))
  }

  setDrivePosition(position: Vector3, rotation: Quaternion) {
    this._pxJoint.setDrivePosition(position, rotation);
  }

  setDriveVelocity(linear: Vector3, angular: Vector3) {
    this._pxJoint.setDriveVelocity(linear, angular);
  }

  setProjectionLinearTolerance(tolerance: number) {
    this._pxJoint.setProjectionLinearTolerance(tolerance);
  }

  setProjectionAngularTolerance(tolerance: number) {
    this._pxJoint.setProjectionAngularTolerance(tolerance);
  }
}
