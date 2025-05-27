import { Color } from "@galacean/engine";
import { UIRenderer } from "../../UIRenderer";
import { InteractiveState } from "../UIInteractive";
import { Transition } from "./Transition";

/**
 * Color transition.
 */
export class ColorTransition extends Transition<Color, UIRenderer> {
  private _color: Color = new Color();
  constructor() {
    super();
    this._normal = new Color(1, 1, 1, 1);
    this._hover = new Color(0.9130986517934192, 0.9130986517934192, 0.9130986517934192, 1);
    this._pressed = new Color(0.5775804404296506, 0.5775804404296506, 0.5775804404296506, 1);
    this._disabled = new Color(0.5775804404296506, 0.5775804404296506, 0.5775804404296506, 1);
    this._duration = 0.1;
    this._currentValue = new Color();

    this._onNormalValueChanged = this._onNormalValueChanged.bind(this);
    this._onHoverValueChanged = this._onHoverValueChanged.bind(this);
    this._onPressedValueChanged = this._onPressedValueChanged.bind(this);
    this._onDisabledValueChanged = this._onDisabledValueChanged.bind(this);

    // @ts-ignore
    this._normal._onValueChanged = this._onNormalValueChanged;
    // @ts-ignore
    this._hover._onValueChanged = this._onHoverValueChanged;
    // @ts-ignore
    this._pressed._onValueChanged = this._onPressedValueChanged;
    // @ts-ignore
    this._disabled._onValueChanged = this._onDisabledValueChanged;
  }

  private _onNormalValueChanged(): void {
    if (this._finalState === InteractiveState.Normal) {
      this._finalValue = this._normal;
      this._updateValue();
    }
  }

  private _onHoverValueChanged(): void {
    if (this._finalState === InteractiveState.Hover) {
      this._finalValue = this._hover;
      this._updateValue();
    }
  }

  private _onPressedValueChanged(): void {
    if (this._finalState === InteractiveState.Pressed) {
      this._finalValue = this._pressed;
      this._updateValue();
    }
  }

  private _onDisabledValueChanged(): void {
    if (this._finalState === InteractiveState.Disable) {
      this._finalValue = this._disabled;
      this._updateValue();
    }
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
