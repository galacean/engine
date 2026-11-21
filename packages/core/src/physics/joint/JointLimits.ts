import { MathUtil } from "@galacean/engine-math";
import { DataObject } from "../../base/DataObject";
import { UpdateFlagManager } from "../../UpdateFlagManager";

/**
 * The angular limits and spring settings of a hinge.
 */
export class JointLimits extends DataObject {
  /** @internal */
  _updateFlagManager = new UpdateFlagManager();

  private _max = 0;
  private _min = 0;
  private _contactDistance = -1;
  private _stiffness = 0;
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
   * How far inside a hard limit the solver starts enforcing it, in radians.
   * @remarks Assign -1 to use 49% of the angular range, capped at 0.1 radians.
   */
  get contactDistance(): number {
    if (this._contactDistance === -1) {
      return Math.min(0.1, 0.49 * MathUtil.degreeToRadian(this._max - this._min));
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
