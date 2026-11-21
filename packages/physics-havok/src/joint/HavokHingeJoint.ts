import { MathUtil, Vector3 } from "@galacean/engine";
import { IHingeJoint } from "@galacean/engine-design";
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
  private _softLimitAppliedOnConstraint = false;
  private _motorSuppressed = false;
  private _lastMotorDt = 0;

  setAxis(value: Vector3): void {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
      return;
    }
    const len = Math.hypot(value.x, value.y, value.z);
    if (!(len > 0 && Number.isFinite(len))) {
      return;
    }
    const nx = value.x / len;
    const ny = value.y / len;
    const nz = value.z / len;
    const a = this._axis;
    if (a.x === nx && a.y === ny && a.z === nz) return;
    a.set(nx, ny, nz);
    this._computePerpAxis();
    this._anchorsDirty = true;
  }

  getAngle(): number {
    const rot0 = HavokJoint._tempQuatA;
    const rot1 = HavokJoint._tempQuatB;
    const scratchPos = HavokJoint._tempVecA;
    this._collider.getWorldTransform(scratchPos, rot0);
    if (this._connectedCollider) {
      this._connectedCollider.getWorldTransform(scratchPos, rot1);
    } else {
      rot1.set(0, 0, 0, 1);
    }

    const axisW = HavokJoint._tempVecA;
    const ref0 = HavokJoint._tempVecB;
    const ref1 = HavokJoint._tempVecC;

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

    const cx = ref0.y * ref1.z - ref0.z * ref1.y;
    const cy = ref0.z * ref1.x - ref0.x * ref1.z;
    const cz = ref0.x * ref1.y - ref0.y * ref1.x;
    const sinA = cx * axisW.x + cy * axisW.y + cz * axisW.z;
    const cosA = Vector3.dot(ref0, ref1);
    const deg = MathUtil.radianToDegree(Math.atan2(sinA, cosA));
    return deg === 0 ? 0 : deg;
  }

  getVelocity(): Readonly<number> {
    const hk = this._havokPhysics._hk;
    const rot0 = HavokJoint._tempQuatA;
    const axisW = HavokJoint._tempVecA;
    this._collider.getWorldTransform(axisW, rot0);
    Vector3.transformByQuat(this._axis, rot0, axisW);
    axisW.normalize();

    let rx = 0,
      ry = 0,
      rz = 0;
    if (this._collider._isDynamic) {
      const [, w0] = hk.HP_Body_GetAngularVelocity(this._collider._hkBody);
      rx -= w0[0];
      ry -= w0[1];
      rz -= w0[2];
    }
    const connected = this._connectedCollider;
    if (connected && connected._isDynamic) {
      const [, w1] = hk.HP_Body_GetAngularVelocity(connected._hkBody);
      rx += w1[0];
      ry += w1[1];
      rz += w1[2];
    }
    const vel = rx * axisW.x + ry * axisW.y + rz * axisW.z;
    return vel === 0 ? 0 : vel;
  }

  setHardLimit(lowerLimit: number, upperLimit: number, contactDist?: number): void;
  setHardLimit(lowerLimit: number, upperLimit: number): void {
    const lower = MathUtil.degreeToRadian(lowerLimit);
    const upper = MathUtil.degreeToRadian(upperLimit);
    if (!this._isSoftLimit && this._lowerLimitRad === lower && this._upperLimitRad === upper) return;
    this._lowerLimitRad = lower;
    this._upperLimitRad = upper;
    if (this._isSoftLimit && this._softLimitAppliedOnConstraint) {
      // Havok has no API to clear soft-limit stiffness/damping back to rigid hard-limit mode.
      this._needsRebuild = true;
    }
    this._isSoftLimit = false;
    this._configDirty = true;
  }

  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void {
    const lower = MathUtil.degreeToRadian(lowerLimit);
    const upper = MathUtil.degreeToRadian(upperLimit);
    if (
      this._isSoftLimit &&
      this._lowerLimitRad === lower &&
      this._upperLimitRad === upper &&
      this._stiffness === stiffness &&
      this._damping === damping
    ) {
      return;
    }
    this._lowerLimitRad = lower;
    this._upperLimitRad = upper;
    this._isSoftLimit = true;
    this._stiffness = stiffness;
    this._damping = damping;
    this._configDirty = true;
  }

  setDriveVelocity(velocity: number): void {
    if (this._driveVelocity === velocity) return;
    this._driveVelocity = velocity;
    this._configDirty = true;
  }

  setDriveForceLimit(limit: number): void {
    const next = Number.isFinite(limit) ? Math.max(0, limit) : Infinity;
    if (this._driveForceLimit === next) return;
    this._driveForceLimit = next;
    this._configDirty = true;
  }

  setDriveGearRatio(ratio: number): void {
    // Havok WASM has no asymmetric per-body gear ratio Jacobian; scaling target velocity
    // matches PhysX exactly when the parent body is static/kinematic (w0 = 0).
    const next = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.0;
    if (this._driveGearRatio === next) return;
    this._driveGearRatio = next;
    this._configDirty = true;
  }

  setHingeJointFlag(flag: number, value: boolean): void {
    if (flag === HingeJointFlagBits.LimitEnabled) {
      if (this._limitEnabled === value) return;
      this._limitEnabled = value;
      this._configDirty = true;
    } else if (flag === HingeJointFlagBits.DriveEnabled) {
      if (this._driveEnabled === value) return;
      this._driveEnabled = value;
      this._configDirty = true;
    } else if (flag === HingeJointFlagBits.DriveFreeSpin) {
      if (this._freeSpin === value) return;
      this._freeSpin = value;
      this._configDirty = true;
    }
  }

  /** @internal */
  override _preStep(dt: number): void {
    super._preStep(dt);
    if (this._broken || this._destroyed || !this._enabled || !this._driveEnabled) return;

    if (this._freeSpin) {
      const curVel = this.getVelocity();
      const target = this._driveVelocity / this._driveGearRatio;
      const overspeed = target === 0 ? Math.abs(curVel) > 0 : target > 0 ? curVel >= target : curVel <= target;
      if (overspeed && !this._motorSuppressed) {
        this._setMotorEnabled(false, dt);
        this._motorSuppressed = true;
        return;
      } else if (!overspeed && this._motorSuppressed) {
        this._setMotorEnabled(true, dt);
        this._motorSuppressed = false;
        return;
      }
    }

    if (!this._motorSuppressed && Number.isFinite(this._driveForceLimit) && dt > 0 && dt !== this._lastMotorDt) {
      this._lastMotorDt = dt;
      const hk = this._havokPhysics._hk;
      hk.HP_Constraint_SetAxisMotorMaxForce(
        this._hkConstraint,
        hk.ConstraintAxis.ANGULAR_X,
        this._computeMotorMaxTorque(dt)
      );
    }
  }

  protected override _getParentBasis(outAxisX: Vector3, outAxisY: Vector3): void {
    outAxisX.copyFrom(this._axis);
    outAxisY.copyFrom(this._perpAxis);
  }

  protected override _onConstraintRecreated(): void {
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
    this._setMotorEnabled(this._driveEnabled, dt);
  }

  private _setMotorEnabled(enabled: boolean, dt: number): void {
    const hk = this._havokPhysics._hk;
    const axisX = hk.ConstraintAxis.ANGULAR_X;
    if (!enabled) {
      // Havok WASM ignores ConstraintMotorType.NONE once VELOCITY is active; zeroing max force disables torque.
      hk.HP_Constraint_SetAxisMotorType(this._hkConstraint, axisX, hk.ConstraintMotorType.NONE);
      hk.HP_Constraint_SetAxisMotorMaxForce(this._hkConstraint, axisX, 0);
    } else {
      const effectiveDt = dt > 0 ? dt : 1 / 60;
      this._lastMotorDt = effectiveDt;
      hk.HP_Constraint_SetAxisMotorType(this._hkConstraint, axisX, hk.ConstraintMotorType.VELOCITY);
      hk.HP_Constraint_SetAxisMotorVelocityTarget(
        this._hkConstraint,
        axisX,
        this._driveVelocity / this._driveGearRatio
      );
      hk.HP_Constraint_SetAxisMotorMaxForce(this._hkConstraint, axisX, this._computeMotorMaxTorque(effectiveDt));
    }
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
    const ref = HavokJoint._tempVecA;
    if (Math.abs(a.x) < 0.9) {
      ref.set(1, 0, 0);
    } else {
      ref.set(0, 1, 0);
    }
    Vector3.cross(a, ref, this._perpAxis);
    this._perpAxis.normalize();
  }
}
