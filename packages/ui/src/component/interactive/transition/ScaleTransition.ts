import { UIRenderer } from "../../UIRenderer";
import { Transition } from "./Transition";

/**
 * Scale transition.
 */
export class ScaleTransition extends Transition<number, UIRenderer> {
  constructor() {
    super();
    this._normal = 1;
    this._hover = 1;
    this._pressed = 1.2;
    this._disabled = 1;
    this._duration = 0.1;
  }

  protected _getTargetValueCopy(): number {
    return this._target?.entity.transform.scale.x || this._normal;
  }

  protected override _updateCurrentValue(srcValue: number, destValue: number, weight: number): void {
    this._currentValue = weight >= 1 ? destValue : (destValue - srcValue) * weight + srcValue;
  }

  protected override _applyValue(value: number): void {
    this._target.entity.transform.setScale(value, value, value);
  }
}
