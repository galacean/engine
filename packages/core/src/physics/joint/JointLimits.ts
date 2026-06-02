import { property } from "../../clone/CloneManager";
import { UpdateFlagManager } from "../../UpdateFlagManager";

/**
 * JointLimits is used to limit the joints angle.
 */
export class JointLimits {
  @property
  /** @internal */
  _updateFlagManager = new UpdateFlagManager();

  @property
  private _max = 0;
  @property
  private _min = 0;
  @property
  private _contactDistance = -1;
  @property
  private _stiffness = 0;
  @property
  private _damping = 0;

  /**
   * The upper angular limit (in degrees) of the joint.
   */
  get max(): number {
    return this._max;
  }

  set max(value: number) {
    if (this._max !== value) {
      if (value < this._min) {
        this._min = value;
      }
      this._max = value;
      this._updateFlagManager.dispatch();
    }
  }

  /**
   * The lower angular limit (in degrees) of the joint.
   */
  get min(): number {
    return this._min;
  }

  set min(value: number) {
    if (this._min !== value) {
      if (value > this._max) {
        this._max = value;
      }
      this._min = value;
      this._updateFlagManager.dispatch();
    }
  }

  /**
   * Distance inside the limit value at which the limit will be considered to be active by the solver.
   * Default is the lesser of 0.1 radians, and 0.49 * (upperLimit - lowerLimit)
   */
  get contactDistance(): number {
    if (this._contactDistance === -1) {
      return Math.min(0.1, 0.49 * (this._max - this._min));
    }
    return this._contactDistance;
  }

  set contactDistance(value: number) {
    if (this._contactDistance !== value) {
      this._contactDistance = value;
      this._updateFlagManager.dispatch();
    }
  }

  /**
   * The spring forces used to reach the target position.
   */
  get stiffness(): number {
    return this._stiffness;
  }

  set stiffness(value: number) {
    if (this._stiffness !== value) {
      this._stiffness = value;
      this._updateFlagManager.dispatch();
    }
  }

  /**
   * The damper force uses to dampen the spring.
   */
  get damping(): number {
    return this._damping;
  }

  set damping(value: number) {
    if (this._damping !== value) {
      this._damping = value;
      this._updateFlagManager.dispatch();
    }
  }
}
