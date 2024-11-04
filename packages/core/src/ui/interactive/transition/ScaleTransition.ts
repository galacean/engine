import { UIImage } from "../../UIImage";
import { Transition } from "./Transition";

export class ScaleTransition extends Transition<number, UIImage> {
  constructor() {
    super();
    this._normal = 1;
    this._hover = 1;
    this._pressed = 1.2;
    this._disabled = 1;
    this._duration = 0.1;
    this._currentValue = 1;
  }

  protected override _updateCurrentValue(srcValue: number, destValue: number, weight: number): void {
    this._currentValue = weight >= 1 ? destValue : (destValue - srcValue) * weight + srcValue;
  }

  protected override _applyValue(value: number): void {
    this._target.entity.transform.setScale(value, value, value);
    console.log("_applyValue", this._currentValue);
  }
}
