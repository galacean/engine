import { IHingeJoint } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Collider } from "../Collider";
import { PhysicsScene } from "../PhysicsScene";
import { HingeJointFlag } from "../enums/HingeJointFlag";
import { Joint } from "./Joint";
import { JointLimits } from "./JointLimits";
import { JointMotor } from "./JointMotor";
import { ignoreClone } from "../../clone/CloneManager";

/**
 * A joint which behaves in a similar way to a hinge or axle.
 */
export class HingeJoint extends Joint {
  @ignoreClone
  private _axis = new Vector3(1, 0, 0);
  @ignoreClone
  private _hingeFlags = HingeJointFlag.None;
  @ignoreClone
  private _useSpring = false;
  @ignoreClone
  private _jointMonitor: JointMotor;
  @ignoreClone
  private _limits: JointLimits;

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
      (<IHingeJoint>this._nativeJoint).setAxis(axis);
    }
  }

  /**
   * The current angle in degrees of the joint relative to its rest position.
   */
  get angle(): number {
    return (<IHingeJoint>this._nativeJoint).getAngle();
  }

  /**
   * The angular velocity of the joint in degrees per second.
   */
  get velocity(): Readonly<number> {
    return (<IHingeJoint>this._nativeJoint).getVelocity();
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
      (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.LimitEnabled, value);
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
      (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.DriveEnabled, value);
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
      this.limits = this._limits;
    }
  }

  /**
   * The motor will apply a force up to a maximum force to achieve the target velocity in degrees per second.
   */
  get motor(): JointMotor {
    return this._jointMonitor;
  }

  set motor(value: JointMotor) {
    if (this._jointMonitor !== value) {
      this._jointMonitor = value;
      (<IHingeJoint>this._nativeJoint).setDriveVelocity(value.targetVelocity);
      (<IHingeJoint>this._nativeJoint).setDriveForceLimit(value.forceLimit);
      (<IHingeJoint>this._nativeJoint).setDriveGearRatio(value.gearRation);
      (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.DriveFreeSpin, value.freeSpin);
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
      this._limits = value;
      if (this.useSpring) {
        (<IHingeJoint>this._nativeJoint).setSoftLimit(value.min, value.max, value.stiffness, value.damping);
      } else {
        (<IHingeJoint>this._nativeJoint).setHardLimit(value.min, value.max, value.contactDistance);
      }
    }
  }

  protected _createJoint(): void {
    const colliderInfo = this._colliderInfo;
    colliderInfo.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsScene._nativePhysics.createHingeJoint(colliderInfo.collider._nativeCollider);
  }

  protected override _syncBackends(): void {
    super._syncBackends();
    const motor = this._jointMonitor;
    (<IHingeJoint>this._nativeJoint).setAxis(this._axis);
    (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.LimitEnabled, this.useLimits);
    (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.DriveEnabled, this.useMotor);
    if (motor) {
      (<IHingeJoint>this._nativeJoint).setDriveVelocity(motor.targetVelocity);
      (<IHingeJoint>this._nativeJoint).setDriveForceLimit(motor.forceLimit);
      (<IHingeJoint>this._nativeJoint).setDriveGearRatio(motor.gearRation);
      (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.DriveFreeSpin, motor.freeSpin);
    }
  }
}
