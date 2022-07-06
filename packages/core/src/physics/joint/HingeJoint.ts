import { Joint } from "./Joint";
import { IHingeJoint } from "@oasis-engine/design";
import { PhysicsManager } from "../PhysicsManager";
import { HingeJointFlag } from "../enums";
import { Collider } from "../Collider";
import { dependentComponents } from "../../ComponentsDependencies";
import { Vector3, Quaternion } from "@oasis-engine/math";
import { JointMotor } from "./JointMotor";
import { JointLimits } from "./JointLimits";

/**
 * A joint which behaves in a similar way to a hinge or axle.
 */
export class HingeJoint extends Joint {
  private _swingOffset: Vector3 = new Vector3();
  private _axis: Vector3 = new Vector3(1, 0, 0);
  private _hingeFlags: number = 0;
  private _useSpring: boolean = false;
  private _jointMonitor: JointMotor;
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
    }
    (<IHingeJoint>this._nativeJoint).setAxis(axis);
  }

  /**
   * The swing offset.
   */
  get swingOffset(): Vector3 {
    return this._swingOffset;
  }

  set swingOffset(value: Vector3) {
    const swingOffset = this._swingOffset;
    if (value !== swingOffset) {
      swingOffset.copyFrom(value);
    }
    (<IHingeJoint>this._nativeJoint).setSwingOffset(swingOffset);
  }

  /**
   * The connected anchor position.
   * @remark If connectedCollider is set, this anchor is relative offset.
   * Or the anchor is world anchor position.
   */
  get connectedAnchor(): Vector3 {
    return this._connectedCollider.localPosition;
  }

  set connectedAnchor(value: Vector3) {
    (<IHingeJoint>this._nativeJoint).setConnectedAnchor(value);
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
  get velocity(): Readonly<Vector3> {
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
      this._hingeFlags |= HingeJointFlag.LimitEnabled;
    }
    (<IHingeJoint>this._nativeJoint).setRevoluteJointFlag(HingeJointFlag.LimitEnabled, value);
  }

  /**
   * Enables the joint's motor. Disabled by default.
   */
  get useMotor(): boolean {
    return (this._hingeFlags & HingeJointFlag.DriveEnabled) == HingeJointFlag.DriveEnabled;
  }

  set useMotor(value: boolean) {
    if (value !== this.useMotor) {
      this._hingeFlags |= HingeJointFlag.DriveEnabled;
    }
    (<IHingeJoint>this._nativeJoint).setRevoluteJointFlag(HingeJointFlag.DriveEnabled, value);
  }

  /**
   * Enables the joint's spring. Disabled by default.
   */
  get useSpring(): boolean {
    return this._useSpring;
  }

  set useSpring(value: boolean) {
    this._useSpring = value;
  }

  /**
   * The motor will apply a force up to a maximum force to achieve the target velocity in degrees per second.
   */
  get motor(): JointMotor {
    return this._jointMonitor;
  }

  set motor(value: JointMotor) {
    this._jointMonitor = value;
    (<IHingeJoint>this._nativeJoint).setDriveVelocity(value.targetVelocity);
    (<IHingeJoint>this._nativeJoint).setDriveForceLimit(value.forceLimit);
    (<IHingeJoint>this._nativeJoint).setDriveGearRatio(value.gearRation);
    (<IHingeJoint>this._nativeJoint).setRevoluteJointFlag(HingeJointFlag.DriveFreeSpin, value.freeSpin);
  }

  /**
   * Limit of angular rotation (in degrees) on the hinge joint.
   */
  get limits(): JointLimits {
    return this._limits;
  }

  set limits(value: JointLimits) {
    this._limits = value;
    if (this.useSpring) {
      (<IHingeJoint>this._nativeJoint).setSoftLimit(value.min, value.max, value.stiffness, value.damping);
    } else {
      (<IHingeJoint>this._nativeJoint).setHardLimit(value.min, value.max, value.contactDistance);
    }
  }

  /**
   * @override
   * @internal
   */
  _onAwake() {
    const jointCollider0 = this._connectedCollider;
    const jointCollider1 = this._collider;
    jointCollider0.collider = null;
    jointCollider1.collider = this.entity.getComponent(Collider);
    this._nativeJoint = PhysicsManager._nativePhysics.createHingeJoint(
      null,
      jointCollider0.localPosition,
      jointCollider0.localRotation,
      jointCollider1.collider._nativeCollider,
      jointCollider1.localPosition,
      jointCollider1.localRotation
    );
  }
}
