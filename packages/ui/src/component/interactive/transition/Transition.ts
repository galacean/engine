import { CloneMode, Color, ReferResource, Sprite, defaultCloneMode, ignoreClone } from "@galacean/engine";
import { UIRenderer } from "../../UIRenderer";
import { InteractiveState, UIInteractive } from "../UIInteractive";

/**
 * The transition behavior of UIInteractive.
 */
@defaultCloneMode(CloneMode.Deep)
export abstract class Transition<
  T extends TransitionValueType = TransitionValueType,
  K extends UIRenderer = UIRenderer
> {
  /** @internal */
  _interactive: UIInteractive;

  protected _target: K;
  protected _normal: T;
  protected _pressed: T;
  protected _hover: T;
  protected _disabled: T;
  protected _duration: number = 0;
  // Transient run state — rebuilt by `_setState` when the cloned interactive activates; the
  // slots own no resource reference (destroy only releases the four state values).
  @ignoreClone
  protected _countDown: number = 0;
  @ignoreClone
  protected _initialValue: T;
  @ignoreClone
  protected _finalValue: T;
  @ignoreClone
  protected _currentValue: T;
  @ignoreClone
  protected _finalState: InteractiveState = InteractiveState.Normal;

  /**
   * The normal state of the transition.
   */
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

  /**
   * The pressed state of the transition.
   */
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

  /**
   * The hover state of the transition.
   */
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

  /**
   * The disabled state of the transition.
   */
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

  /**
   * The target of the transition.
   */
  get target(): K {
    return this._target;
  }

  set target(value: K) {
    if (this._target !== value) {
      this._target = value;
      value?.enabled && this._applyValue(this._currentValue);
    }
  }

  /**
   * The duration of the transition.
   */
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

  destroy(): void {
    this._interactive?.removeTransition(this);
    // Release the ref-counted state values (paired with the setter's +1 and, for clones,
    // `_cloneTo`'s +1) — implemented here so every subclass with ReferResource states is covered.
    const releaseState = (state: T): void => {
      // @ts-ignore
      state instanceof ReferResource && state._addReferCount(-1);
    };
    releaseState(this._normal);
    releaseState(this._pressed);
    releaseState(this._hover);
    releaseState(this._disabled);
    this._normal = this._pressed = this._hover = this._disabled = null;
    this._initialValue = this._currentValue = this._finalValue = null;
    this._target = null;
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
