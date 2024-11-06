import { UpdateFlagManager } from "../../UpdateFlagManager";

/**
 * The JointMotor is used to motorize a joint.
 */
export class JointMotor {
  /** @internal */
  _updateFlagManager = new UpdateFlagManager();

  private _targetVelocity: number = 0;
  private _forceLimit: number = Number.MAX_VALUE;
  private _gearRation: number = 1.0;
  private _freeSpin: boolean = false;

  /**
   * The motor will apply a force up to force to achieve targetVelocity.
   */
  get targetVelocity(): number {
    return this._targetVelocity;
  }

  set targetVelocity(value: number) {
    this._targetVelocity = value;
    this._updateFlagManager.dispatch();
  }

  /**
   * The force limit.
   */
  get forceLimit(): number {
    return this._forceLimit;
  }

  set forceLimit(value: number) {
    this._forceLimit = value;
    this._updateFlagManager.dispatch();
  }

  /**
   * Gear ration for the motor
   */
  get gearRation(): number {
    return this._gearRation;
  }

  set gearRation(value: number) {
    this._gearRation = value;
    this._updateFlagManager.dispatch();
  }

  /**
   * If freeSpin is enabled the motor will only accelerate but never slow down.
   */
  get freeSpin(): boolean {
    return this._freeSpin;
  }

  set freeSpin(value: boolean) {
    this._freeSpin = value;
    this._updateFlagManager.dispatch();
  }
}
