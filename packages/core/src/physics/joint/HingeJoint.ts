import { IDynamicCollider, IHingeJoint } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { HingeJointFlag } from "../enums/HingeJointFlag";
import { Joint } from "./Joint";
import { JointLimits } from "./JointLimits";
import { JointMotor } from "./JointMotor";
import { ignoreClone } from "../../clone/CloneDecorators";
import { Entity } from "../../Entity";

/**
 * A joint which behaves in a similar way to a hinge or axle.
 */
export class HingeJoint extends Joint {
  private _axis = new Vector3(1, 0, 0);
  private _hingeFlags = HingeJointFlag.None;
  private _useSpring = false;
  private _jointMotor: JointMotor | null = null;
  private _limits: JointLimits | null = null;
  @ignoreClone
  private _angle = 0;
  @ignoreClone
  private _velocity = 0;

  /**
   * The Direction of the axis around which the hingeJoint.
   */
  get axis(): Vector3 {
    return this._axis;
  }

  set axis(value: Vector3) {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
      throw new Error("HingeJoint axis must be finite.");
    }
    const len = Math.hypot(value.x, value.y, value.z);
    if (!Number.isFinite(len)) {
      throw new Error("HingeJoint axis must be finite.");
    }
    if (len === 0) {
      console.warn("HingeJoint: axis cannot be a zero vector.");
      return;
    }
    const axis = this._axis;
    if (value !== axis) {
      axis.copyFrom(value);
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
   * The angular velocity of the joint in radians per second.
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
      this._syncLimitsEnabled();
      if (this._nativeJoint) {
        this._wakeBodies();
      }
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
      this._syncMotorEnabled();
      if (this._nativeJoint) {
        this._wakeBodies();
      }
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
   * The motor will apply a force up to a maximum force to achieve the target velocity in radians per second.
   */
  get motor(): JointMotor | null {
    return this._jointMotor;
  }

  set motor(value: JointMotor | null) {
    if (this._jointMotor !== value) {
      this._jointMotor?._updateFlagManager.removeListener(this._onMotorChanged);

      this._jointMotor = value;
      value?._updateFlagManager.addListener(this._onMotorChanged);

      this._syncMotorEnabled();
      this._onMotorChanged();
      if (!value && this._nativeJoint) {
        this._wakeBodies();
      }
    }
  }

  /**
   * Limit of angular rotation (in degrees) on the hinge joint.
   */
  get limits(): JointLimits | null {
    return this._limits;
  }

  set limits(value: JointLimits | null) {
    if (this._limits !== value) {
      this._limits?._updateFlagManager.removeListener(this._onLimitsChanged);

      this._limits = value;
      value?._updateFlagManager.addListener(this._onLimitsChanged);

      this._syncLimitsEnabled();
      this._onLimitsChanged();
      if (!value && this._nativeJoint) {
        this._wakeBodies();
      }
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this._onMotorChanged = this._onMotorChanged.bind(this);
    this._onLimitsChanged = this._onLimitsChanged.bind(this);
    this._onAxisChanged = this._onAxisChanged.bind(this);
    //@ts-ignore
    this._axis._onValueChanged = this._onAxisChanged;
  }

  /**
   * @internal
   */
  override _onDisableInScene(): void {
    const nativeJoint = <IHingeJoint | null>this._nativeJoint;
    if (nativeJoint) {
      this._angle = nativeJoint.getAngle();
      this._velocity = nativeJoint.getVelocity();
    }
    super._onDisableInScene();
  }

  /**
   * @internal
   */
  override _onClone(target: HingeJoint): void {
    super._onClone(target);
    target._jointMotor?._updateFlagManager.addListener(target._onMotorChanged);
    target._limits?._updateFlagManager.addListener(target._onLimitsChanged);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._jointMotor?._updateFlagManager.removeListener(this._onMotorChanged);
    this._limits?._updateFlagManager.removeListener(this._onLimitsChanged);
  }

  protected override _createJoint(actor: IDynamicCollider): IHingeJoint {
    return Engine._nativePhysics.createHingeJoint(actor);
  }

  protected override _syncNative(): void {
    super._syncNative();
    const nativeJoint = <IHingeJoint>this._nativeJoint;
    nativeJoint.setAxis(this._axis);
    this._syncLimitsEnabled();
    this._syncMotorEnabled();
    this._onMotorChanged();
    this._onLimitsChanged();
  }

  private _syncLimitsEnabled(): void {
    (<IHingeJoint>this._nativeJoint)?.setHingeJointFlag(
      HingeJointFlag.LimitEnabled,
      this.useLimits && this._limits !== null
    );
  }

  private _syncMotorEnabled(): void {
    (<IHingeJoint>this._nativeJoint)?.setHingeJointFlag(
      HingeJointFlag.DriveEnabled,
      this.useMotor && this._jointMotor !== null
    );
  }

  @ignoreClone
  private _onMotorChanged() {
    const motor = this._jointMotor;
    if (motor && this._nativeJoint) {
      (<IHingeJoint>this._nativeJoint).setDriveVelocity(motor.targetVelocity);
      (<IHingeJoint>this._nativeJoint).setDriveForceLimit(motor.forceLimit);
      (<IHingeJoint>this._nativeJoint).setDriveGearRatio(motor.gearRatio);
      (<IHingeJoint>this._nativeJoint).setHingeJointFlag(HingeJointFlag.DriveFreeSpin, motor.freeSpin);
      this._wakeBodies();
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
      this._wakeBodies();
    }
  }

  @ignoreClone
  private _onAxisChanged(): void {
    const axis = this._axis;
    const len = Math.hypot(axis.x, axis.y, axis.z);
    if (!Number.isFinite(axis.x) || !Number.isFinite(axis.y) || !Number.isFinite(axis.z) || !Number.isFinite(len)) {
      //@ts-ignore
      axis._onValueChanged = null;
      axis.set(1, 0, 0);
      //@ts-ignore
      axis._onValueChanged = this._onAxisChanged;
      if (this._nativeJoint) {
        (<IHingeJoint>this._nativeJoint).setAxis(axis);
        this._wakeBodies();
      }
      throw new Error("HingeJoint axis must be finite.");
    }
    if (len === 0) {
      return;
    }
    //@ts-ignore
    axis._onValueChanged = null;
    axis.set(axis.x / len, axis.y / len, axis.z / len);
    //@ts-ignore
    axis._onValueChanged = this._onAxisChanged;
    if (this._nativeJoint) {
      (<IHingeJoint>this._nativeJoint).setAxis(axis);
      this._wakeBodies();
    }
  }
}
