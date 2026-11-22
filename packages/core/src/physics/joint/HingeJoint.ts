import { IDynamicCollider, IHingeJoint } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { Collider } from "../Collider";
import { HingeJointFlag } from "../enums/HingeJointFlag";
import { Joint } from "./Joint";
import { JointLimits } from "./JointLimits";
import { JointMotor } from "./JointMotor";
import { ignoreClone } from "../../clone/CloneDecorators";
import { Entity } from "../../Entity";

/**
 * A joint that allows rotation around one axis.
 */
export class HingeJoint extends Joint {
  private _axis = new Vector3(1, 0, 0);
  @ignoreClone
  private _lastValidAxis?: Vector3;
  private _hingeFlags = HingeJointFlag.None;
  private _useSpring = false;
  private _jointMotor: JointMotor | null = null;
  private _limits: JointLimits | null = null;
  @ignoreClone
  private _angle = 0;
  @ignoreClone
  private _velocity = 0;

  /**
   * The mutable hinge axis in this Entity's local space.
   * @remarks Edits normalize the vector. A zero value leaves the previous direction unchanged.
   * @defaultValue `(1, 0, 0)`
   * @throws When the vector length is non-finite.
   */
  get axis(): Vector3 {
    return this._axis;
  }

  set axis(value: Vector3) {
    if (value !== this._axis) this._setAxis(value);
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
    this._onAxisChanged = this._onAxisChanged.bind(this);
    this._axis._onValueChanged = this._onAxisChanged;
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
    this._axis._onValueChanged = null;
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

  @ignoreClone
  private _onAxisChanged(): void {
    this._setAxis(this._axis);
  }

  private _setAxis(value: Vector3): void {
    const axis = this._axis;
    if (Collider._syncUnitVector(axis, value, this._lastValidAxis, 1, 0, 0, "HingeJoint axis must be finite.")) {
      (this._lastValidAxis ||= new Vector3()).copyFrom(axis);
      const nativeJoint = <IHingeJoint | null>this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setAxis(axis);
        this._wakeBodies();
      }
    }
  }
}
