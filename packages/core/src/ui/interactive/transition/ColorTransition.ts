import { Color } from "@galacean/engine-math";
import { Transition } from "./Transition";
import { UIRenderer } from "../../UIRenderer";

export class ColorTransition extends Transition<Color, UIRenderer> {
  private _color: Color = new Color();
  constructor() {
    super();
    this._normal = new Color(1, 1, 1, 1);
    this._hover = new Color(245 / 255, 245 / 255, 245 / 255, 1);
    this._pressed = new Color(200 / 255, 200 / 255, 200 / 255, 1);
    this._disabled = new Color(200 / 255, 200 / 255, 200 / 255, 1);
    this._duration = 0.1;
    this._currentValue = new Color();
  }

  protected _getTargetValueCopy(): Color {
    const color = this._color;
    color.copyFrom(this._target?.color || this._normal);
    return color;
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
