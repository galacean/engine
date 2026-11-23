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
  protected declare _nativeJoint: IHingeJoint | null;

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
    const nativeJoint = this._nativeJoint;
    if (nativeJoint) {
      this._angle = nativeJoint.getAngle();
    }
    return this._angle;
  }

  /**
   * The angular velocity of the joint in radians per second.
   */
  get velocity(): number {
    const nativeJoint = this._nativeJoint;
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
      this._syncAndWake(this._syncLimitsEnabled);
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
      this._syncAndWake(this._syncMotorEnabled);
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
      this._limits && this._onLimitsChanged();
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

      this._syncAndWake(this._syncMotorConfig);
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

      this._syncAndWake(this._syncLimitsConfig);
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
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setAxis(axis);
        this._wakeBodies();
      }
    }
  }

  /** @internal */
  protected override _destroyNativeJoint(): void {
    const nativeJoint = this._nativeJoint;
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
    const nativeJoint = this._nativeJoint!;
    nativeJoint.setAxis(this._axis);
    this._syncMotorConfig(nativeJoint);
    this._syncLimitsConfig(nativeJoint);
  }

  @ignoreClone
  private _onMotorChanged(): void {
    this._syncAndWake(this._syncMotor);
  }

  @ignoreClone
  private _onLimitsChanged(): void {
    this._syncAndWake(this._syncLimits);
  }

  private _syncAndWake(sync: (this: HingeJoint, nativeJoint: IHingeJoint) => void): void {
    const nativeJoint = this._nativeJoint;
    if (nativeJoint) {
      sync.call(this, nativeJoint);
      this._wakeBodies();
    }
  }

  private _syncLimitsEnabled(nativeJoint: IHingeJoint): void {
    nativeJoint.setHingeJointFlag(HingeJointFlag.LimitEnabled, this.useLimits && this._limits !== null);
  }

  private _syncMotorEnabled(nativeJoint: IHingeJoint): void {
    nativeJoint.setHingeJointFlag(HingeJointFlag.DriveEnabled, this.useMotor && this._jointMotor !== null);
  }

  private _syncMotorConfig(nativeJoint: IHingeJoint): void {
    this._syncMotorEnabled(nativeJoint);
    this._syncMotor(nativeJoint);
  }

  private _syncLimitsConfig(nativeJoint: IHingeJoint): void {
    this._syncLimitsEnabled(nativeJoint);
    this._syncLimits(nativeJoint);
  }

  private _syncMotor(nativeJoint: IHingeJoint): void {
    const motor = this._jointMotor;
    if (motor) {
      nativeJoint.setDriveVelocity(motor.targetVelocity);
      nativeJoint.setDriveForceLimit(motor.forceLimit);
      nativeJoint.setDriveGearRatio(motor.gearRatio);
      nativeJoint.setHingeJointFlag(HingeJointFlag.DriveFreeSpin, motor.freeSpin);
    }
  }

  private _syncLimits(nativeJoint: IHingeJoint): void {
    const limits = this._limits;
    if (limits) {
      if (this.useSpring) {
        nativeJoint.setSoftLimit(limits.min, limits.max, limits.stiffness, limits.damping);
      } else {
        nativeJoint.setHardLimit(limits.min, limits.max, limits.contactDistance);
      }
    }
  }
}
