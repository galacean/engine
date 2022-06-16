import { PhysXJoint } from "./PhysXJoint";
import { IConfigurableJoint } from "@oasis-engine/design";
import { PhysXCollider } from "../PhysXCollider";
import { Quaternion, Vector3 } from "oasis-engine";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * A D6 joint is a general constraint between two actors.
 */
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

  /**
   * {@inheritDoc IConfigurableJoint.setMotion }
   */
  setMotion(axis: number, type: number): void {
    this._pxJoint.setMotion(axis, type);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setHardDistanceLimit }
   */
  setHardDistanceLimit(extent: number, contactDist: number): void {
    this._pxJoint.setHardDistanceLimit(PhysXPhysics._pxPhysics.getTolerancesScale(), extent, contactDist);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setSoftDistanceLimit }
   */
  setSoftDistanceLimit(extent: number, stiffness: number, damping: number): void {
    this._pxJoint.setSoftDistanceLimit(extent, stiffness, damping);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setHardLinearLimit }
   */
  setHardLinearLimit(axis: number, lowerLimit: number, upperLimit: number, contactDist: number): void {
    this._pxJoint.setHardLinearLimit(
      axis,
      PhysXPhysics._pxPhysics.getTolerancesScale(),
      lowerLimit,
      upperLimit,
      contactDist
    );
  }

  /**
   * {@inheritDoc IConfigurableJoint.setSoftLinearLimit }
   */
  setSoftLinearLimit(axis: number, lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void {
    this._pxJoint.setSoftLinearLimit(axis, lowerLimit, upperLimit, stiffness, damping);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setHardTwistLimit }
   */
  setHardTwistLimit(lowerLimit: number, upperLimit: number, contactDist: number): void {
    this._pxJoint.setHardTwistLimit(lowerLimit, upperLimit, contactDist);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setSoftTwistLimit }
   */
  setSoftTwistLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void {
    this._pxJoint.setSoftTwistLimit(lowerLimit, upperLimit, stiffness, damping);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setHardSwingLimit }
   */
  setHardSwingLimit(yLimitAngle: number, zLimitAngle: number, contactDist: number): void {
    this._pxJoint.setHardSwingLimit(yLimitAngle, zLimitAngle, contactDist);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setSoftSwingLimit }
   */
  setSoftSwingLimit(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number): void {
    this._pxJoint.setSoftSwingLimit(yLimitAngle, zLimitAngle, stiffness, damping);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setHardPyramidSwingLimit }
   */
  setHardPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    contactDist: number
  ): void {
    this._pxJoint.setHardPyramidSwingLimit(yLimitAngleMin, yLimitAngleMax, zLimitAngleMin, zLimitAngleMax, contactDist);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setSoftPyramidSwingLimit }
   */
  setSoftPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    stiffness: number,
    damping: number
  ): void {
    this._pxJoint.setSoftPyramidSwingLimit(
      yLimitAngleMin,
      yLimitAngleMax,
      zLimitAngleMin,
      zLimitAngleMax,
      stiffness,
      damping
    );
  }

  /**
   * {@inheritDoc IConfigurableJoint.setDrive }
   */
  setDrive(index: number, driveStiffness: number, driveDamping: number, driveForceLimit: number): void {
    this._pxJoint.setDrive(index, driveStiffness, driveDamping, driveForceLimit);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setDrivePosition }
   */
  setDrivePosition(position: Vector3, rotation: Quaternion): void {
    this._pxJoint.setDrivePosition(position, rotation);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setDriveVelocity }
   */
  setDriveVelocity(linear: Vector3, angular: Vector3): void {
    this._pxJoint.setDriveVelocity(linear, angular);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setProjectionLinearTolerance }
   */
  setProjectionLinearTolerance(tolerance: number): void {
    this._pxJoint.setProjectionLinearTolerance(tolerance);
  }

  /**
   * {@inheritDoc IConfigurableJoint.setProjectionAngularTolerance }
   */
  setProjectionAngularTolerance(tolerance: number): void {
    this._pxJoint.setProjectionAngularTolerance(tolerance);
  }
}
