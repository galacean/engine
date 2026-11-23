import { IHingeJoint } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXActor } from "../PhysXActor";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXJoint } from "./PhysXJoint";

/**
 * PhysX revolute joint.
 */
export class PhysXHingeJoint extends PhysXJoint implements IHingeJoint {
  private _axisRotationQuaternion = new Quaternion();
  private _connectedAxisRotationQuaternion = new Quaternion();

  constructor(physXPhysics: PhysXPhysics, actor: PhysXActor) {
    super(physXPhysics);
    this._actor = actor;
    this._pxJoint = physXPhysics._pxPhysics.createRevoluteJoint(
      actor._pxActor,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat,
      null,
      PhysXJoint._defaultVec,
      PhysXJoint._defaultQuat
    );
  }

  override setRotation(value: Quaternion): void {
    this._rotation.copyFrom(value);
    this._updateConnectedPose();
  }

  /**
   * {@inheritDoc IHingeJoint.setAxis }
   */
  setAxis(value: Vector3): void {
    const { x, y, z } = value;
    const axisRotationQuaternion = this._axisRotationQuaternion;
    // Rotate PhysX’s local X axis onto the requested hinge axis.
    const lateral = Math.hypot(y, z);
    if (lateral > 0) {
      const halfAngle = Math.atan2(lateral, x) * 0.5;
      const sine = Math.sin(halfAngle);
      axisRotationQuaternion.set(0, (-z / lateral) * sine, (y / lateral) * sine, Math.cos(halfAngle));
    } else if (x < 0) {
      // Use a stable rotation axis for the antiparallel case.
      axisRotationQuaternion.set(0, 1, 0, 0);
    } else {
      axisRotationQuaternion.set(0, 0, 0, 1);
    }
    this._setLocalPose(0, this._anchor, axisRotationQuaternion);
    this._updateConnectedPose();
  }

  private _updateConnectedPose(): void {
    const connectedAxisRotationQuaternion = this._connectedAxisRotationQuaternion;
    Quaternion.multiply(this._rotation, this._axisRotationQuaternion, connectedAxisRotationQuaternion);
    this._setLocalPose(1, this._connectedAnchor, connectedAxisRotationQuaternion);
  }

  override setAnchor(value: Vector3): void {
    this._setLocalPose(0, value, this._axisRotationQuaternion);
    this._anchor = value;
  }

  /**
   * {@inheritDoc IJoint.setConnectedAnchor }
   */
  override setConnectedAnchor(value: Vector3): void {
    this._setLocalPose(1, value, this._connectedAxisRotationQuaternion);
    this._connectedAnchor = value;
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
  getVelocity(): number {
    return this._pxJoint.getVelocity();
  }

  /**
   * {@inheritDoc IHingeJoint.setHardLimit }
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number): void {
    this._pxJoint.setHardLimit(lowerLimit, upperLimit, contactDist, 0);
  }

  /**
   * {@inheritDoc IHingeJoint.setSoftLimit }
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void {
    this._pxJoint.setSoftLimit(lowerLimit, upperLimit, stiffness, damping);
  }

  /**
   * {@inheritDoc IHingeJoint.setDriveVelocity }
   */
  setDriveVelocity(velocity: number): void {
    this._pxJoint.setDriveVelocity(velocity, false);
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
   * {@inheritDoc IHingeJoint.setLimitEnabled }
   */
  setLimitEnabled(enabled: boolean): void {
    this._pxJoint.setRevoluteJointFlag(1, enabled); // eLIMIT_ENABLED
  }

  /**
   * {@inheritDoc IHingeJoint.setDriveEnabled }
   */
  setDriveEnabled(enabled: boolean): void {
    this._pxJoint.setRevoluteJointFlag(2, enabled); // eDRIVE_ENABLED
  }

  /**
   * {@inheritDoc IHingeJoint.setDriveFreeSpin }
   */
  setDriveFreeSpin(enabled: boolean): void {
    this._pxJoint.setRevoluteJointFlag(4, enabled); // eDRIVE_FREESPIN
  }
}
