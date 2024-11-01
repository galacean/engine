import { Color } from "@galacean/engine-math";
import { Sprite } from "../../../2d";
import { UIRenderer } from "../../UIRenderer";
import { InteractiveStatus } from "../InteractiveStatus";
import { SamplingType } from "./SamplingType";
import { CopyType } from "./CopyType";

export abstract class Transition<T extends TransitionValueType = any, K extends UIRenderer = any> {
  samplingType: SamplingType = SamplingType.Continuous;
  copyType: CopyType = CopyType.Shallow;

  protected _normal: T;
  protected _pressed: T;
  protected _hover: T;
  protected _disabled: T;
  protected _target: K;
  protected _duration: number = 0;
  protected _countDown: number = 0;
  protected _initialState: InteractiveStatus = InteractiveStatus.Normal;
  protected _initialValue: T;
  protected _finalState: InteractiveStatus = InteractiveStatus.Normal;
  protected _finalValue: T;

  get normal(): T {
    return this._normal;
  }

  set normal(value: T) {
    const preNormal = this._normal;
    if (preNormal !== value) {
      this._normal = value;
      this._onStateValueDirty(InteractiveStatus.Normal);
    }
  }

  get pressed(): T {
    return this._pressed;
  }

  set pressed(value: T) {
    const prePressed = this._pressed;
    if (prePressed !== value) {
      this._pressed = value;
      this._onStateValueDirty(InteractiveStatus.Pressed);
    }
  }

  get hover(): T {
    return this._hover;
  }

  set hover(value: T) {
    const preHover = this._hover;
    if (preHover !== value) {
      this._hover = value;
      this._onStateValueDirty(InteractiveStatus.Hover);
    }
  }

  get disabled(): T {
    return this._disabled;
  }

  set disabled(value: T) {
    const preDisabled = this._disabled;
    if (preDisabled !== value) {
      this._disabled = value;
      this._onStateValueDirty(InteractiveStatus.Disable);
    }
  }

  private _onStateValueDirty(status: InteractiveStatus) {
    let needUpdateValue = false;
    if (this._initialState === status) {
      this._initialValue = this._getValueByState(status);
      needUpdateValue = true;
    }
    if (this._finalState === status) {
      this._finalValue = this._getValueByState(status);
      needUpdateValue = true;
    }
    needUpdateValue && this._updateValue();
  }

  get target(): K {
    return this._target;
  }

  set target(value: K) {
    if (this._target !== value) {
      this._target = value;
      this._applyValue(this._getCurrentValue());

      this._updateValue();
    }
  }

  get duration(): number {
    return this._duration;
  }

  set duration(value: number) {
    if (value < 0) value = 0;
    const preDuration = this._duration;
    if (preDuration !== value) {
      this._duration = value;
      if (this._countDown > 0) {
        this._countDown = value * (1 - this._countDown / preDuration);
        this._updateValue();
      }
    }
  }

  setStatus(status: InteractiveStatus, instant: boolean) {
    if (instant) {
      this._countDown = 0;
      this._applyValue((this._initialValue = this._finalValue = this._getValueByState(status)));
    } else {
      this._initialValue = this._getCurrentValue();
      this._finalValue = this._getValueByState(status);
      const countDown = (this._countDown = this._duration);
      this._applyValue(countDown > 0 ? this._initialValue : this._finalValue);
    }
  }

  /**
   * @internal
   */
  _onUpdate(delta: number): void {
    let countDown = this._countDown;
    if (countDown > 0) {
      this._countDown = countDown -= delta;
      this._updateValue();
    }
  }

  protected abstract _getCurrentValue(): T;
  protected abstract _samplingValue(srcValue: T, destValue: T, weight: number, out: T): T;
  protected _dispose() {}

  protected _isEqual(srcValue: T, targetValue: T): boolean {
    return srcValue === targetValue;
  }

  protected abstract _applyValue(value: T);

  private _updateValue() {
    const currentValue = this._getCurrentValue();
    const value = this._samplingValue(this._initialValue, this._finalValue, 1, currentValue);
    this._applyValue(value);
  }

  private _getValueByState(state: InteractiveStatus): T {
    switch (state) {
      case InteractiveStatus.Normal:
        return this.normal;
      case InteractiveStatus.Pressed:
        return this.pressed;
      case InteractiveStatus.Hover:
        return this.hover;
      case InteractiveStatus.Disable:
        return this.disabled;
    }
  }
}

export type TransitionValueType = number | Sprite | Color;
