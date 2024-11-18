import { Color, ReferResource, Sprite } from "@galacean/engine";
import { UIRenderer } from "../../UIRenderer";
import { InteractiveState } from "../UIInteractive";

export abstract class Transition<
  T extends TransitionValueType = TransitionValueType,
  K extends UIRenderer = UIRenderer
> {
  protected _target: K;
  protected _normal: T;
  protected _pressed: T;
  protected _hover: T;
  protected _disabled: T;
  protected _duration: number = 0;
  protected _countDown: number = 0;
  protected _initialValue: T;
  protected _finalValue: T;
  protected _currentValue: T;
  protected _finalState: InteractiveState = InteractiveState.Normal;

  get normal(): T {
    return this._normal;
  }

  set normal(value: T) {
    const preNormal = this._normal;
    if (preNormal !== value) {
      this._normal = value;
      this._onStateValueDirty(InteractiveState.Normal, preNormal, value);
    }
  }

  get pressed(): T {
    return this._pressed;
  }

  set pressed(value: T) {
    const prePressed = this._pressed;
    if (prePressed !== value) {
      this._pressed = value;
      this._onStateValueDirty(InteractiveState.Pressed, prePressed, value);
    }
  }

  get hover(): T {
    return this._hover;
  }

  set hover(value: T) {
    const preHover = this._hover;
    if (preHover !== value) {
      this._hover = value;
      this._onStateValueDirty(InteractiveState.Hover, preHover, value);
    }
  }

  get disabled(): T {
    return this._disabled;
  }

  set disabled(value: T) {
    const preDisabled = this._disabled;
    if (preDisabled !== value) {
      this._disabled = value;
      this._onStateValueDirty(InteractiveState.Disable, preDisabled, value);
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
  _setState(state: InteractiveState, instant: boolean) {
    this._finalState = state;
    const value = this._getValueByState(state);
    if (instant) {
      this._countDown = 0;
      this._initialValue = this._finalValue = value;
    } else {
      this._countDown = this._duration;
      this._initialValue = this._getTargetValueCopy();
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

  /**
   * @internal
   */
  _destroy(): void {
    this._target = null;
  }

  protected abstract _getTargetValueCopy(): T;
  protected abstract _updateCurrentValue(srcValue: T, destValue: T, weight: number): void;
  protected abstract _applyValue(value: T): void;

  protected _onStateValueDirty(state: InteractiveState, preValue: T, curValue: T): void {
    // @ts-ignore
    preValue instanceof ReferResource && preValue._addReferCount(-1);
    // @ts-ignore
    curValue instanceof ReferResource && curValue._addReferCount(1);
    if (this._finalState === state) {
      this._finalValue = curValue;
      this._updateValue();
    }
  }

  protected _updateValue() {
    const weight = this._duration ? 1 - this._countDown / this._duration : 1;
    this._updateCurrentValue(this._initialValue, this._finalValue, weight);
    this._target?.enabled && this._applyValue(this._currentValue);
  }

  private _getValueByState(state: InteractiveState): T {
    switch (state) {
      case InteractiveState.Normal:
        return this.normal;
      case InteractiveState.Pressed:
        return this.pressed;
      case InteractiveState.Hover:
        return this.hover;
      case InteractiveState.Disable:
        return this.disabled;
    }
  }
}

export type TransitionValueType = number | Sprite | Color;
