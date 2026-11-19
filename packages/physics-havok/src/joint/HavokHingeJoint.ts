import { MathUtil, Quaternion, Vector3 } from "@galacean/engine";
import { IHingeJoint } from "@galacean/engine-design";
import { HavokCollider } from "../HavokCollider";
import { HavokPhysics } from "../HavokPhysics";
import { HavokJoint } from "./HavokJoint";

const enum HingeJointFlagBits {
  LimitEnabled = 1,
  DriveEnabled = 2,
  DriveFreeSpin = 4
}

const MAX_MOTOR_TORQUE = 1e12;

/**
 * Hinge (revolute) joint for Havok.
 */
export class HavokHingeJoint extends HavokJoint implements IHingeJoint {
  private static _tempPos0 = new Vector3();
  private static _tempPos1 = new Vector3();
  private static _tempRot0 = new Quaternion();
  private static _tempRot1 = new Quaternion();
  private static _tempAxisW = new Vector3();
  private static _tempRef0 = new Vector3();
  private static _tempRef1 = new Vector3();
  private static _tempCross = new Vector3();
  private static _tempBasisRef = new Vector3();

  private _axis = new Vector3(1, 0, 0);
  private _perpAxis = new Vector3(0, 1, 0);
  private _limitEnabled = false;
  private _driveEnabled = false;
  private _freeSpin = false;
  private _driveVelocity = 0;
  private _driveForceLimit = Infinity;
  private _driveGearRatio = 1.0;
  private _lowerLimitRad = -Math.PI * 0.5;
  private _upperLimitRad = Math.PI * 0.5;
  private _isSoftLimit = false;
  private _stiffness = 0;
  private _damping = 0;
  private _axesConfigured = false;
  private _softLimitAppliedOnConstraint = false;
  private _motorSuppressed = false;
  private _lastMotorDt = 0;

  constructor(havokPhysics: HavokPhysics, collider: HavokCollider) {
    super(havokPhysics, collider);
  }

  setAxis(value: Vector3): void {
    if (value.lengthSquared() < 1e-12) {
      return;
    }
    this._axis.copyFrom(value).normalize();
    this._computePerpAxis();
    this._dirty = true;
  }

  getAngle(): number {
    const rot0 = HavokHingeJoint._tempRot0;
    const rot1 = HavokHingeJoint._tempRot1;
    this._collider.getWorldTransform(HavokHingeJoint._tempPos0, rot0);
    if (this._connectedCollider) {
      this._connectedCollider.getWorldTransform(HavokHingeJoint._tempPos1, rot1);
    } else {
      rot1.set(0, 0, 0, 1);
    }

    const axisW = HavokHingeJoint._tempAxisW;
    const ref0 = HavokHingeJoint._tempRef0;
    const ref1 = HavokHingeJoint._tempRef1;

    Vector3.transformByQuat(this._axis, rot0, axisW);
    axisW.normalize();

    Vector3.transformByQuat(this._perpAxis, rot0, ref0);
    Vector3.transformByQuat(this._perpAxis, this._rotation, ref1);
    Vector3.transformByQuat(ref1, rot1, ref1);

    const d0 = Vector3.dot(ref0, axisW);
    ref0.set(ref0.x - axisW.x * d0, ref0.y - axisW.y * d0, ref0.z - axisW.z * d0);
    const d1 = Vector3.dot(ref1, axisW);
    ref1.set(ref1.x - axisW.x * d1, ref1.y - axisW.y * d1, ref1.z - axisW.z * d1);

    const len0 = ref0.length();
    const len1 = ref1.length();
    if (len0 < 1e-6 || len1 < 1e-6) return 0;
    ref0.scale(1 / len0);
    ref1.scale(1 / len1);

    const cross = HavokHingeJoint._tempCross;
    Vector3.cross(ref0, ref1, cross);
    const sinA = Vector3.dot(cross, axisW);
    const cosA = Vector3.dot(ref0, ref1);
    const deg = MathUtil.radianToDegree(Math.atan2(sinA, cosA));
    return deg === 0 ? 0 : deg;
  }

  getVelocity(): Readonly<number> {
    const hk = this._havokPhysics._hk;
    const rot0 = HavokHingeJoint._tempRot0;
    this._collider.getWorldTransform(HavokHingeJoint._tempPos0, rot0);
    const axisW = HavokHingeJoint._tempAxisW;
    Vector3.transformByQuat(this._axis, rot0, axisW);
    axisW.normalize();

    const [, w0] = hk.HP_Body_GetAngularVelocity(this._collider._hkBody);
    let rx = -w0[0];
    let ry = -w0[1];
    let rz = -w0[2];
    if (this._connectedCollider) {
      const [, w1] = hk.HP_Body_GetAngularVelocity(this._connectedCollider._hkBody);
      rx += w1[0];
      ry += w1[1];
      rz += w1[2];
    }
    const vel = rx * axisW.x + ry * axisW.y + rz * axisW.z;
    return vel === 0 ? 0 : vel;
  }

  setHardLimit(lowerLimit: number, upperLimit: number): void {
    this._lowerLimitRad = MathUtil.degreeToRadian(lowerLimit);
    this._upperLimitRad = MathUtil.degreeToRadian(upperLimit);
    if (this._isSoftLimit && this._softLimitAppliedOnConstraint) {
      // Havok has no API to clear soft-limit stiffness/damping back to rigid hard-limit mode.
      this._needsRebuild = true;
    }
    this._isSoftLimit = false;
    this._dirty = true;
  }

  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void {
    this._lowerLimitRad = MathUtil.degreeToRadian(lowerLimit);
    this._upperLimitRad = MathUtil.degreeToRadian(upperLimit);
    this._isSoftLimit = true;
    this._stiffness = stiffness;
    this._damping = damping;
    this._dirty = true;
  }

  setDriveVelocity(velocity: number): void {
    this._driveVelocity = velocity;
    this._dirty = true;
  }

  setDriveForceLimit(limit: number): void {
    this._driveForceLimit = Number.isFinite(limit) ? Math.max(0, limit) : Infinity;
    this._dirty = true;
  }

  setDriveGearRatio(ratio: number): void {
    // Havok WASM has no asymmetric per-body gear ratio Jacobian; scaling target velocity
    // matches PhysX exactly when the parent body is static/kinematic (w0 = 0).
    this._driveGearRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.0;
    this._dirty = true;
  }

  setHingeJointFlag(flag: number, value: boolean): void {
    if (flag === HingeJointFlagBits.LimitEnabled) {
      this._limitEnabled = value;
      this._dirty = true;
    } else if (flag === HingeJointFlagBits.DriveEnabled) {
      this._driveEnabled = value;
      this._dirty = true;
    } else if (flag === HingeJointFlagBits.DriveFreeSpin) {
      this._freeSpin = value;
      this._dirty = true;
    }
  }

  override _preStep(dt: number): void {
    super._preStep(dt);
    if (this._broken || this._destroyed || !this._enabled || !this._driveEnabled) return;

    const hk = this._havokPhysics._hk;
    const axisX = hk.ConstraintAxis.ANGULAR_X;

    if (this._freeSpin) {
      const curVel = this.getVelocity();
      const target = this._getEffectiveDriveVelocity();
      const overspeed = target === 0 ? Math.abs(curVel) > 0 : target > 0 ? curVel >= target : curVel <= target;
      if (overspeed && !this._motorSuppressed) {
        // Havok WASM ignores ConstraintMotorType.NONE once VELOCITY is active; zeroing max force disables torque.
        hk.HP_Constraint_SetAxisMotorType(this._hkConstraint, axisX, hk.ConstraintMotorType.NONE);
        hk.HP_Constraint_SetAxisMotorMaxForce(this._hkConstraint, axisX, 0);
        this._motorSuppressed = true;
        return;
      } else if (!overspeed && this._motorSuppressed) {
        const effectiveDt = dt > 0 ? dt : 1 / 60;
        this._lastMotorDt = effectiveDt;
        hk.HP_Constraint_SetAxisMotorType(this._hkConstraint, axisX, hk.ConstraintMotorType.VELOCITY);
        hk.HP_Constraint_SetAxisMotorVelocityTarget(this._hkConstraint, axisX, target);
        hk.HP_Constraint_SetAxisMotorMaxForce(this._hkConstraint, axisX, this._computeMotorMaxTorque(effectiveDt));
        this._motorSuppressed = false;
        return;
      }
    }

    if (!this._motorSuppressed && dt > 0 && dt !== this._lastMotorDt) {
      this._lastMotorDt = dt;
      hk.HP_Constraint_SetAxisMotorMaxForce(this._hkConstraint, axisX, this._computeMotorMaxTorque(dt));
    }
  }

  protected override _getParentBasis(outAxisX: Vector3, outAxisY: Vector3): void {
    outAxisX.copyFrom(this._axis);
    outAxisY.copyFrom(this._perpAxis);
  }

  protected override _onConstraintRecreated(): void {
    this._axesConfigured = false;
    this._softLimitAppliedOnConstraint = false;
    this._motorSuppressed = false;
    this._lastMotorDt = 0;
  }

  protected override _applyConstraintConfig(dt: number): void {
    const hk = this._havokPhysics._hk;
    const axis = hk.ConstraintAxis;

    if (!this._axesConfigured) {
      const locked = hk.ConstraintAxisLimitMode.LOCKED;
      hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.LINEAR_X, locked);
      hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.LINEAR_Y, locked);
      hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.LINEAR_Z, locked);
      hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.ANGULAR_Y, locked);
      hk.HP_Constraint_SetAxisMode(this._hkConstraint, axis.ANGULAR_Z, locked);
      this._axesConfigured = true;
    }

    const axisX = axis.ANGULAR_X;
    if (!this._limitEnabled) {
      hk.HP_Constraint_SetAxisMode(this._hkConstraint, axisX, hk.ConstraintAxisLimitMode.FREE);
    } else {
      hk.HP_Constraint_SetAxisMode(this._hkConstraint, axisX, hk.ConstraintAxisLimitMode.LIMITED);
      hk.HP_Constraint_SetAxisMinLimit(this._hkConstraint, axisX, this._lowerLimitRad);
      hk.HP_Constraint_SetAxisMaxLimit(this._hkConstraint, axisX, this._upperLimitRad);
      if (this._isSoftLimit) {
        hk.HP_Constraint_SetAxisStiffness(this._hkConstraint, axisX, this._stiffness);
        hk.HP_Constraint_SetAxisDamping(this._hkConstraint, axisX, this._damping);
        this._softLimitAppliedOnConstraint = true;
      }
    }

    this._motorSuppressed = false;
    if (!this._driveEnabled) {
      // Havok WASM ignores ConstraintMotorType.NONE once VELOCITY is active; zeroing max force disables torque.
      hk.HP_Constraint_SetAxisMotorType(this._hkConstraint, axisX, hk.ConstraintMotorType.NONE);
      hk.HP_Constraint_SetAxisMotorMaxForce(this._hkConstraint, axisX, 0);
    } else {
      const effectiveDt = dt > 0 ? dt : 1 / 60;
      this._lastMotorDt = effectiveDt;
      hk.HP_Constraint_SetAxisMotorType(this._hkConstraint, axisX, hk.ConstraintMotorType.VELOCITY);
      hk.HP_Constraint_SetAxisMotorVelocityTarget(this._hkConstraint, axisX, this._getEffectiveDriveVelocity());
      hk.HP_Constraint_SetAxisMotorMaxForce(this._hkConstraint, axisX, this._computeMotorMaxTorque(effectiveDt));
    }
  }

  private _getEffectiveDriveVelocity(): number {
    return this._driveVelocity / this._driveGearRatio;
  }

  private _computeMotorMaxTorque(dt: number): number {
    // PhysX setDriveForceLimit defaults to impulse-per-step (eDRIVE_LIMITS_ARE_FORCES = false);
    // divide by dt to convert to Havok's torque limit (N*m).
    if (!Number.isFinite(this._driveForceLimit) || this._driveForceLimit >= MAX_MOTOR_TORQUE * dt) {
      return MAX_MOTOR_TORQUE;
    }
    return this._driveForceLimit / dt;
  }

  private _computePerpAxis(): void {
    const a = this._axis;
    const ref = HavokHingeJoint._tempBasisRef;
    if (Math.abs(a.x) < 0.9) {
      ref.set(1, 0, 0);
    } else {
      ref.set(0, 1, 0);
    }
    Vector3.cross(a, ref, this._perpAxis);
    this._perpAxis.normalize();
  }
}
