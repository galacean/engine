import { IHingeJoint } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Collider } from "../Collider";
import { PhysicsScene } from "../PhysicsScene";
import { HingeJointFlag } from "../enums/HingeJointFlag";
import { Joint } from "./Joint";
import { JointLimits } from "./JointLimits";
import { JointMotor } from "./JointMotor";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { Entity } from "../../Entity";

/**
 * A joint which behaves in a similar way to a hinge or axle.
 */
export class HingeJoint extends Joint {
  @deepClone
  private _axis = new Vector3(1, 0, 0);
  private _hingeFlags = HingeJointFlag.None;
  private _useSpring = false;
  @deepClone
  private _jointMotor: JointMotor;
  @deepClone
  private _limits: JointLimits;
  private _angle = 0;
  private _velocity = 0;

  /**
   * The anchor rotation.
   */
  get axis(): Vector3 {
    return this._axis;
  }

  set axis(value: Vector3) {
    const axis = this._axis;
    if (value !== axis) {
      axis.copyFrom(value);
      (<IHingeJoint>this._nativeJoint)?.setAxis(axis);
    }
  }

  /**
   * The current angle in degrees of the joint relative to its rest position.
   */
  get angle(): number {
    const nativeJoint = <IHingeJoint>this._nativeJoint;
    if (nativeJoint) {
      this._angle = nativeJoint.getAngle();
    }
    return this._angle;
  }

  /**
   * The angular velocity of the joint in degrees per second.
   */
  get velocity(): Readonly<number> {
    const nativeJoint = <IHingeJoint>this._nativeJoint;
    if (nativeJoint) {
      this._velocity = nativeJoint.getVelocity();
    }
    return this._velocity;
  }

  /**
   * Enables the joint's limits. Disabled by default.
   */
  get useLimits(): boolean {
    return (this._hingeFlags & HingeJointFlag.LimitEnabled) == HingeJointFlag.LimitEnabled;
  }

  set useLimits(value: boolean) {
    if (value !== this.useLimits) {
      value ? (this._hingeFlags |= HingeJointFlag.LimitEnabled) : (this._hingeFlags &= ~HingeJointFlag.LimitEnabled);
      (<IHingeJoint>this._nativeJoint)?.setHingeJointFlag(HingeJointFlag.LimitEnabled, value);
    }
  }

  /**
   * Enables the joint's motor. Disabled by default.
   */
  get useMotor(): boolean {
    return (this._hingeFlags & HingeJointFlag.DriveEnabled) == HingeJointFlag.DriveEnabled;
  }

  set useMotor(value: boolean) {
    if (value !== this.useMotor) {
      value ? (this._hingeFlags |= HingeJointFlag.DriveEnabled) : (this._hingeFlags &= ~HingeJointFlag.DriveEnabled);
      (<IHingeJoint>this._nativeJoint)?.setHingeJointFlag(HingeJointFlag.DriveEnabled, value);
    }
  }

  /**
   * Enables the joint's spring. Disabled by default.
   */
  get useSpring(): boolean {
    return this._useSpring;
  }

  set useSpring(value: boolean) {
    if (this._useSpring !== value) {
      this._useSpring = value;
      this._onLimitsChanged();
    }
  }

  /**
   * The motor will apply a force up to a maximum force to achieve the target velocity in degrees per second.
   */
  get motor(): JointMotor {
    return this._jointMotor;
  }

  set motor(value: JointMotor) {
    if (this._jointMotor !== value) {
      this._jointMotor?._updateFlagManager.removeListener(this._onMotorChanged);

      this._jointMotor = value;
      value?._updateFlagManager.addListener(this._onMotorChanged);

      this._onMotorChanged();
    }
  }

  /**
   * Limit of angular rotation (in degrees) on the hinge joint.
   */
  get limits(): JointLimits {
    return this._limits;
  }

  set limits(value: JointLimits) {
    if (this._limits !== value) {
      this._limits?._updateFlagManager.removeListener(this._onLimitsChanged);

      this._limits = value;
      value?._updateFlagManager.addListener(this._onLimitsChanged);

      this._onLimitsChanged();
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this._onMotorChanged = this._onMotorChanged.bind(this);
    this._onLimitsChanged = this._onLimitsChanged.bind(this);
  }

  protected _createJoint(): void {
    const colliderInfo = this._colliderInfo;
    colliderInfo.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsScene._nativePhysics.createHingeJoint(colliderInfo.collider._nativeCollider);
  }

  protected override _syncNative(): void {
    super._syncNative();
    const motor = this._jointMotor;
    (<IHingeJoint>this._nativeJoint).setAxis(this._axis);
    (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.LimitEnabled, this.useLimits);
    (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.DriveEnabled, this.useMotor);
    if (motor) {
      (<IHingeJoint>this._nativeJoint).setDriveVelocity(motor.targetVelocity);
      (<IHingeJoint>this._nativeJoint).setDriveForceLimit(motor.forceLimit);
      (<IHingeJoint>this._nativeJoint).setDriveGearRatio(motor.gearRatio);
      (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.DriveFreeSpin, motor.freeSpin);
    }
  }

  @ignoreClone
  private _onMotorChanged() {
    const motor = this._jointMotor;
    if (this._nativeJoint) {
      (<IHingeJoint>this._nativeJoint).setDriveVelocity(motor.targetVelocity);
      (<IHingeJoint>this._nativeJoint).setDriveForceLimit(motor.forceLimit);
      (<IHingeJoint>this._nativeJoint).setDriveGearRatio(motor.gearRatio);
      (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.DriveFreeSpin, motor.freeSpin);
    }
  }

  @ignoreClone
  private _onLimitsChanged() {
    const limits = this._limits;
    if (limits && this._nativeJoint) {
      if (this.useSpring) {
        (<IHingeJoint>this._nativeJoint).setSoftLimit(limits.min, limits.max, limits.stiffness, limits.damping);
      } else {
        (<IHingeJoint>this._nativeJoint).setHardLimit(limits.min, limits.max, limits.contactDistance);
      }
    }
  }
}
