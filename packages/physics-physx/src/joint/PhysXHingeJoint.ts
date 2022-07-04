import { PhysXCollider } from "../PhysXCollider";
import { PhysXJoint } from "./PhysXJoint";
import { IHingeJoint } from "@oasis-engine/design";
import { PhysXPhysics } from "../PhysXPhysics";
import { Quaternion, Vector3 } from "oasis-engine";

/**
 * A joint which behaves in a similar way to a hinge or axle.
 */
export class PhysXHingeJoint extends PhysXJoint implements IHingeJoint {
  private _velocity = new Vector3();

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

  /**
   * {@inheritDoc IHingeJoint.getAngle }
   */
  getAngle(): number {
    return this._pxJoint.getAngle();
  }

  /**
   * {@inheritDoc IHingeJoint.getVelocity }
   */
  getVelocity(): Vector3 {
    const velocity = this._velocity;
    velocity.copyFrom(this._pxJoint.getVelocity());
    return velocity;
  }

  /**
   * {@inheritDoc IHingeJoint.setHardLimitCone }
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number): void {
    this._pxJoint.setHardLimit(lowerLimit, upperLimit, contactDist);
  }

  /**
   * {@inheritDoc IHingeJoint.setHardLimitCone }
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void {
    this._pxJoint.setSoftLimit(lowerLimit, upperLimit, stiffness, damping);
  }

  /**
   * {@inheritDoc IHingeJoint.setDriveVelocity }
   */
  setDriveVelocity(velocity: number): void {
    this._pxJoint.setDriveVelocity(velocity);
  }

  /**
   * {@inheritDoc IHingeJoint.setDriveForceLimit }
   */
  setDriveForceLimit(limit: number): void {
    this._pxJoint.setDriveForceLimit(limit);
  }

  /**
   * {@inheritDoc IHingeJoint.setDriveGearRatio }
   */
  setDriveGearRatio(ratio: number): void {
    this._pxJoint.setDriveGearRatio(ratio);
  }

  /**
   * {@inheritDoc IHingeJoint.setRevoluteJointFlag }
   */
  setRevoluteJointFlag(flag: number, value: boolean): void {
    this._pxJoint.setRevoluteJointFlag(flag, value);
  }

  /**
   * {@inheritDoc IHingeJoint.setProjectionLinearTolerance }
   */
  setProjectionLinearTolerance(tolerance: number): void {
    this._pxJoint.setProjectionLinearTolerance(tolerance);
  }

  /**
   * {@inheritDoc IHingeJoint.setProjectionAngularTolerance }
   */
  setProjectionAngularTolerance(tolerance: number): void {
    this._pxJoint.setProjectionAngularTolerance(tolerance);
  }
}
