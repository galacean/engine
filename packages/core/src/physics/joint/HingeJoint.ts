import { IDynamicCollider, IHingeJoint } from "@galacean/engine-design";
import { assignmentClone, ignoreClone } from "../../clone/CloneDecorators";
import { Engine } from "../../Engine";
import { Entity } from "../../Entity";
import { HingeJointFlag } from "../enums/HingeJointFlag";
import { directionSnapshot, normalizeDirection, type ReadonlyDirection } from "../unitDirection";
import { Joint } from "./Joint";
import { JointLimits } from "./JointLimits";
import { JointMotor } from "./JointMotor";

/**
 * A joint that allows rotation around one axis.
 */
export class HingeJoint extends Joint {
  @assignmentClone
  private _axis = directionSnapshot(1, 0, 0);
  private _hingeFlags = HingeJointFlag.None;
  private _useSpring = false;
  private _jointMotor: JointMotor | null = null;
  private _limits: JointLimits | null = null;
  @ignoreClone
  private _angle = 0;
  @ignoreClone
  private _velocity = 0;

  /**
   * A read-only snapshot of the unit hinge axis in this Entity's local space.
   * @defaultValue `(1, 0, 0)`
   * @see {@link setAxis}
   */
  get axis(): ReadonlyDirection {
    return this._axis;
  }

  set axis(value: ReadonlyDirection) {
    this.setAxis(value);
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
  get velocity(): number {
    const nativeJoint = <IHingeJoint>this._nativeJoint;
    if (nativeJoint) {
      this._velocity = nativeJoint.getVelocity();
    }
    return this._velocity;
  }

  /**
   * Angular limits take effect when this flag is true and {@link limits} is assigned.
   * @defaultValue false
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
   * The motor drives the joint when this flag is true and {@link motor} is assigned.
   * @defaultValue false
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
   * Uses a spring to enforce enabled angular limits. Disabled by default.
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
   * Motor settings. Assign null to remove the motor.
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
   * Angular-limit settings. Assign null to remove the limits.
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
  }

  /**
   * Sets the hinge axis from a complete direction. A zero vector leaves the axis unchanged.
   * @param value - The direction in this Entity's local space, normalized on assignment.
   * @throws When the vector length is non-finite.
   */
  setAxis(value: ReadonlyDirection): void {
    const axis = normalizeDirection(this._axis, value, "HingeJoint axis");
    if (axis !== this._axis) {
      this._axis = axis;
      const nativeJoint = <IHingeJoint | null>this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setAxis(axis);
        this._wakeBodies();
      }
    }
  }

  /** @internal */
  protected override _destroyNativeJoint(): void {
    const nativeJoint = <IHingeJoint | null>this._nativeJoint;
    if (nativeJoint) {
      this._angle = nativeJoint.getAngle();
      this._velocity = nativeJoint.getVelocity();
    }
    super._destroyNativeJoint();
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
    this._jointMotor = this._limits = null;
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
}
