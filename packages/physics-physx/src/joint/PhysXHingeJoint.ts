import { IHingeJoint } from "@galacean/engine-design";
import { MathUtil, Quaternion, Vector3 } from "@galacean/engine";
import { PhysXCollider } from "../PhysXCollider";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXJoint } from "./PhysXJoint";

/**
 * A joint which behaves in a similar way to a hinge or axle.
 */
export class PhysXHingeJoint extends PhysXJoint implements IHingeJoint {
  protected static _xAxis = new Vector3(1, 0, 0);

  private _axis = new Vector3(1, 0, 0);
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
    this.setAxis(this._axis);
  }

  /**
   * {@inheritDoc IHingeJoint.setAxis }
   */
  setAxis(value: Vector3): void {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
      return;
    }
    const len = Math.hypot(value.x, value.y, value.z);
    if (!(len > 0 && Number.isFinite(len))) {
      return;
    }
    const axis = this._axis;
    axis.set(value.x / len, value.y / len, value.z / len);
    const xAxis = PhysXHingeJoint._xAxis;
    const axisRotationQuaternion = this._axisRotationQuaternion;
    xAxis.set(1, 0, 0);
    const dot = MathUtil.clamp(Vector3.dot(xAxis, axis), -1, 1);
    if (dot > 1 - 1e-6) {
      axisRotationQuaternion.set(0, 0, 0, 1);
    } else if (dot < -1 + 1e-6) {
      axisRotationQuaternion.set(0, 1, 0, 0);
    } else {
      const angle = Math.acos(dot);
      Vector3.cross(xAxis, axis, xAxis);
      Quaternion.rotationAxisAngle(xAxis, angle, axisRotationQuaternion);
    }
    this._setLocalPose(0, this._anchor, axisRotationQuaternion);
    const connectedAxisRotationQuaternion = this._connectedAxisRotationQuaternion;
    Quaternion.multiply(this._rotation, axisRotationQuaternion, connectedAxisRotationQuaternion);
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
