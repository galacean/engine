import { deepClone } from "../../clone/CloneManager";
import { UpdateFlagManager } from "../../UpdateFlagManager";

/**
 * The JointMotor is used to motorize a joint.
 */
export class JointMotor {
  @deepClone
  /** @internal */
  _updateFlagManager = new UpdateFlagManager();

  private _targetVelocity = 0;
  private _forceLimit = Number.MAX_VALUE;
  private _gearRatio = 1.0;
  private _freeSpin = false;

  /**
   * The motor will apply a force up to force to achieve targetVelocity.
   */
  get targetVelocity(): number {
    return this._targetVelocity;
  }

  set targetVelocity(value: number) {
    if (this._targetVelocity !== value) {
      this._targetVelocity = value;
      this._updateFlagManager.dispatch();
    }
  }

  /**
   * The force limit.
   */
  get forceLimit(): number {
    return this._forceLimit;
  }

  set forceLimit(value: number) {
    if (this._forceLimit !== value) {
      this._forceLimit = value;
      this._updateFlagManager.dispatch();
    }
  }

  /**
   * Gear ration for the motor
   */
  get gearRatio(): number {
    return this._gearRatio;
  }

  set gearRatio(value: number) {
    if (this._gearRatio !== value) {
      this._gearRatio = value;
      this._updateFlagManager.dispatch();
    }
  }

  /**
   * If freeSpin is enabled the motor will only accelerate but never slow down.
   */
  get freeSpin(): boolean {
    return this._freeSpin;
  }

  set freeSpin(value: boolean) {
    if (this._freeSpin !== value) {
      this._freeSpin = value;
      this._updateFlagManager.dispatch();
    }
  }
}
