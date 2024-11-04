import { Color } from "@galacean/engine-math";
import { UIImage } from "../../UIImage";
import { Transition } from "./Transition";

export class ColorTransition extends Transition<Color, UIImage> {
  constructor() {
    super();
    this._normal = new Color(1, 1, 1, 1);
    this._hover = new Color(245 / 255, 245 / 255, 245 / 255, 1);
    this._pressed = new Color(200 / 255, 200 / 255, 200 / 255, 1);
    this._disabled = new Color(200 / 255, 200 / 255, 200 / 255, 1);
    this._duration = 0.1;
    this._currentValue = new Color();
  }

  protected override _updateCurrentValue(srcValue: Color, destValue: Color, weight: number): void {
    if (weight >= 1) {
      this._currentValue.copyFrom(destValue);
    } else {
      Color.lerp(srcValue, destValue, weight, this._currentValue);
    }
  }

  protected override _applyValue(value: Color): void {
    this._target.color = value;
  }
}
