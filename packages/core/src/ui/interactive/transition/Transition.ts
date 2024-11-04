import { Color, Vector3 } from "@galacean/engine-math";
import { Sprite } from "../../../2d";
import { UIRenderer } from "../../UIRenderer";
import { InteractiveStatus } from "../InteractiveStatus";

export abstract class Transition<T extends TransitionValueType = any, K extends UIRenderer = any> {
  protected _normal: T;
  protected _pressed: T;
  protected _hover: T;
  protected _disabled: T;
  protected _target: K;
  protected _duration: number = 0;
  protected _countDown: number = 0;
  protected _initialValue: T;
  protected _finalValue: T;
  protected _currentValue: T;
  protected _finalState: InteractiveStatus = InteractiveStatus.Normal;

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

  get target(): K {
    return this._target;
  }

  set target(value: K) {
    if (this._target !== value) {
      this._target = value;
      value?.enabled && this._applyValue(this._currentValue);
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

  /**
   * @internal
   */
  _setStatus(status: InteractiveStatus, instant: boolean) {
    this._finalState = status;
    const value = this._getValueByState(status);
    if (instant) {
      this._countDown = 0;
      this._initialValue = this._finalValue = value;
    } else {
      this._countDown = this._duration;
      this._initialValue = this._currentValue;
      this._finalValue = value;
    }
    this._updateValue();
  }

  /**
   * @internal
   */
  _onUpdate(delta: number): void {
    if (this._countDown > 0) {
      this._countDown -= delta;
      this._updateValue();
    }
  }

  protected abstract _updateCurrentValue(srcValue: T, destValue: T, weight: number): void;
  protected abstract _applyValue(value: T): void;

  private _updateValue() {
    this._updateCurrentValue(this._initialValue, this._finalValue, 1 - this._countDown / this._duration);
    this._target?.enabled && this._applyValue(this._currentValue);
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

  private _onStateValueDirty(status: InteractiveStatus) {
    if (this._finalState === status) {
      this._finalValue = this._getValueByState(status);
      this._updateValue();
    }
  }
}

export type TransitionValueType = number | Sprite | Color | Vector3;
