import { IHingeJoint } from "@galacean/engine-design";
import { MathUtil, Quaternion, Vector3 } from "@galacean/engine";
import { PhysXCollider } from "../PhysXCollider";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXJoint } from "./PhysXJoint";

/**
 * PhysX revolute joint.
 */
export class PhysXHingeJoint extends PhysXJoint implements IHingeJoint {
  private _axisRotationQuaternion = new Quaternion();
  private _connectedAxisRotationQuaternion = new Quaternion();

  constructor(physXPhysics: PhysXPhysics, collider: PhysXCollider) {
    super(physXPhysics);
    this._collider = collider;
    this._pxJoint = physXPhysics._pxPhysics.createRevoluteJoint(
      collider._pxActor,
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
    const len = Math.hypot(x, y, z);
    if (!(len > 0 && Number.isFinite(len))) {
      return;
    }
    const normalizedY = y / len;
    const normalizedZ = z / len;
    const axisRotationQuaternion = this._axisRotationQuaternion;
    // Rotate PhysX’s local X axis onto the requested hinge axis.
    const lateral = Math.hypot(normalizedY, normalizedZ);
    if (lateral > 0) {
      const halfAngle = Math.atan2(lateral, x / len) * 0.5;
      const sine = Math.sin(halfAngle);
      axisRotationQuaternion.set(
        0,
        (-normalizedZ / lateral) * sine,
        (normalizedY / lateral) * sine,
        Math.cos(halfAngle)
      );
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
    return MathUtil.radianToDegree(this._pxJoint.getAngle());
  }

  /**
   * {@inheritDoc IHingeJoint.getVelocity }
   */
  getVelocity(): Readonly<number> {
    return this._pxJoint.getVelocity();
  }

  /**
   * {@inheritDoc IHingeJoint.setHardLimit }
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number): void {
    this._pxJoint.setHardLimit(MathUtil.degreeToRadian(lowerLimit), MathUtil.degreeToRadian(upperLimit), contactDist);
  }

  /**
   * {@inheritDoc IHingeJoint.setSoftLimit }
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void {
    this._pxJoint.setSoftLimit(
      MathUtil.degreeToRadian(lowerLimit),
      MathUtil.degreeToRadian(upperLimit),
      stiffness,
      damping
    );
  }

  /**
   * {@inheritDoc IHingeJoint.setDriveVelocity }
   */
  setDriveVelocity(velocity: number, autowake: boolean = true): void {
    this._pxJoint.setDriveVelocity(velocity, autowake);
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
   * {@inheritDoc IHingeJoint.setHingeJointFlag }
   */
  setHingeJointFlag(flag: number, value: boolean): void {
    this._pxJoint.setRevoluteJointFlag(flag, value);
  }
}
