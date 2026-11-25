import { IDynamicActor, IHingeJoint, IPhysicsScene } from "@galacean/engine-design";
import { MathUtil, Vector3, type Vector3Like } from "@galacean/engine-math";
import { assignmentClone, ignoreClone } from "../../clone/CloneDecorators";
import { Entity } from "../../Entity";
import { PhysicsUtils } from "../PhysicsUtils";
import { Joint } from "./Joint";
import { JointLimits } from "./JointLimits";
import { JointMotor } from "./JointMotor";

/**
 * A joint that allows rotation around one axis.
 */
export class HingeJoint extends Joint {
  private static readonly _defaultAxis = Object.freeze(new Vector3(1, 0, 0));

  protected declare _nativeJoint: IHingeJoint | null;

  @assignmentClone
  private _axis = HingeJoint._defaultAxis;
  private _useLimits = false;
  private _useMotor = false;
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
   * @remarks Assign a complete direction to update the axis. A zero vector leaves it unchanged.
   * @throws When the assigned direction has non-finite length.
   */
  get axis(): Readonly<Vector3Like> {
    return this._axis;
  }

  set axis(value: Readonly<Vector3Like>) {
    this._setAxis(value);
  }

  /**
   * The current angle in degrees of the joint relative to its rest position.
   */
  get angle(): number {
    const nativeJoint = this._nativeJoint;
    return nativeJoint ? MathUtil.radianToDegree(nativeJoint.getAngle()) : this._angle;
  }

  /**
   * The angular velocity of the joint in radians per second.
   */
  get velocity(): number {
    const nativeJoint = this._nativeJoint;
    return nativeJoint ? nativeJoint.getVelocity() : this._velocity;
  }

  /**
   * Angular limits take effect when this flag is true and {@link limits} is assigned.
   * @defaultValue false
   */
  get useLimits(): boolean {
    return this._useLimits;
  }

  set useLimits(value: boolean) {
    if (value !== this._useLimits) {
      this._useLimits = value;
      this._syncAndWake(this._syncLimitsEnabled);
    }
  }

  /**
   * The motor drives the joint when this flag is true and {@link motor} is assigned.
   * @defaultValue false
   */
  get useMotor(): boolean {
    return this._useMotor;
  }

  set useMotor(value: boolean) {
    if (value !== this._useMotor) {
      this._useMotor = value;
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
    const previous = this._jointMotor;
    if (previous !== value) {
      this._jointMotor = value;
      if (this._nativeJoint) {
        previous?._updateFlagManager.removeListener(this._onMotorChanged);
        this._bindMotor(this._nativeJoint);
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
    const previous = this._limits;
    if (previous !== value) {
      this._limits = value;
      if (this._nativeJoint) {
        previous?._updateFlagManager.removeListener(this._onLimitsChanged);
        this._bindLimits(this._nativeJoint);
        this._wakeBodies();
      }
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this._onMotorChanged = this._onMotorChanged.bind(this);
    this._onLimitsChanged = this._onLimitsChanged.bind(this);
  }

  protected override _destroyNativeJoint(): void {
    const nativeJoint = this._nativeJoint;
    if (nativeJoint) {
      this._jointMotor?._updateFlagManager.removeListener(this._onMotorChanged);
      this._limits?._updateFlagManager.removeListener(this._onLimitsChanged);
      this._angle = MathUtil.radianToDegree(nativeJoint.getAngle());
      this._velocity = nativeJoint.getVelocity();
    }
    super._destroyNativeJoint();
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._jointMotor = this._limits = null;
  }

  protected override _createJoint(physicsScene: IPhysicsScene, actor: IDynamicActor): IHingeJoint {
    return physicsScene.createHingeJoint(actor);
  }

  protected override _syncNative(): void {
    super._syncNative();
    const nativeJoint = this._nativeJoint!;
    nativeJoint.setAxis(this._axis);
    this._bindMotor(nativeJoint);
    this._bindLimits(nativeJoint);
  }

  // Runtime Prefab calls use this method name.
  private _setAxis(value: Readonly<Vector3Like>): void {
    const axis = PhysicsUtils.normalizeDirection(this._axis, value, "HingeJoint axis");
    if (axis !== this._axis) {
      this._axis = axis;
      const nativeJoint = this._nativeJoint;
      if (nativeJoint) {
        nativeJoint.setAxis(axis);
        this._wakeBodies();
      }
    }
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
    nativeJoint.setLimitEnabled(this._useLimits && this._limits !== null);
  }

  private _syncMotorEnabled(nativeJoint: IHingeJoint): void {
    nativeJoint.setDriveEnabled(this._useMotor && this._jointMotor !== null);
  }

  private _bindMotor(nativeJoint: IHingeJoint): void {
    this._jointMotor?._updateFlagManager.addListener(this._onMotorChanged);
    this._syncMotorEnabled(nativeJoint);
    this._syncMotor(nativeJoint);
  }

  private _bindLimits(nativeJoint: IHingeJoint): void {
    this._limits?._updateFlagManager.addListener(this._onLimitsChanged);
    this._syncLimitsEnabled(nativeJoint);
    this._syncLimits(nativeJoint);
  }

  private _syncMotor(nativeJoint: IHingeJoint): void {
    const motor = this._jointMotor;
    if (motor) {
      nativeJoint.setDriveVelocity(motor.targetVelocity);
      nativeJoint.setDriveForceLimit(motor.forceLimit);
      nativeJoint.setDriveGearRatio(motor.gearRatio);
      nativeJoint.setDriveFreeSpin(motor.freeSpin);
    }
  }

  private _syncLimits(nativeJoint: IHingeJoint): void {
    const limits = this._limits;
    if (limits) {
      const min = MathUtil.degreeToRadian(limits.min);
      const max = MathUtil.degreeToRadian(limits.max);
      if (this.useSpring) nativeJoint.setSoftLimit(min, max, limits.stiffness, limits.damping);
      else nativeJoint.setHardLimit(min, max, limits.contactDistance);
    }
  }
}
