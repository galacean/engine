import { PhysXCollider } from "../PhysXCollider";
import { PhysXJoint } from "./PhysXJoint";
import { IHingeJoint } from "@oasis-engine/design";
import { PhysXPhysics } from "../PhysXPhysics";
import { Quaternion, Vector3 } from "oasis-engine";

/**
 * A joint which behaves in a similar way to a hinge or axle.
 */
export class PhysXHingeJoint extends PhysXJoint implements IHingeJoint {
  private static _tempVector = new Vector3(1, 0, 0);
  private static _tempQuat = new Quaternion();
  private _axisRotationQuaternion = new Quaternion();
  private _connectedAnchor = new Vector3();
  private _swingOffset = new Vector3();
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
      actor0?._pxActor || null,
      position0,
      rotation0,
      actor1?._pxActor || null,
      position1,
      rotation1
    );
  }

  /**
   * {@inheritDoc IHingeJoint.setConnectedAnchor }
   */
  setConnectedAnchor(value: Vector3): void {
    this._connectedAnchor.copyFrom(value);
    this._setLocalPose(0, value, PhysXHingeJoint._tempQuat);
  }

  /**
   * {@inheritDoc IHingeJoint.setAxis }
   */
  setAxis(value: Vector3): void {
    const tempVector = PhysXHingeJoint._tempVector;
    const axisRotationQuaternion = this._axisRotationQuaternion;
    tempVector.set(1, 0, 0);
    const angle = Math.atan(Vector3.dot(tempVector, value));
    Vector3.cross(tempVector, value, tempVector);
    Quaternion.rotationAxisAngle(tempVector, angle, axisRotationQuaternion);

    this._setLocalPose(1, this._swingOffset, axisRotationQuaternion);
  }

  /**
   * {@inheritDoc IHingeJoint.setSwingOffset }
   */
  setSwingOffset(value: Vector3): void {
    this._swingOffset.copyFrom(value);
    this._setLocalPose(1, this._swingOffset, this._axisRotationQuaternion);
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
  getVelocity(): Readonly<Vector3> {
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
}
