import { Sprite } from "../../../2d";
import { Image } from "../../Image";
import { Transition } from "./Transition";

export class SpriteTransition extends Transition<Sprite, Image> {
  /**
   * @internal
   */
  override _destroy(): void {
    if (this._normal) {
      this._normal._addReferCount(-1);
      this._normal = null;
    }
    if (this._hover) {
      this._hover._addReferCount(-1);
      this._hover = null;
    }
    if (this._pressed) {
      this._pressed._addReferCount(-1);
      this._pressed = null;
    }
    if (this._disabled) {
      this._disabled._addReferCount(-1);
      this._disabled = null;
    }
    this._initialValue = this._currentValue = this._finalValue = null;
    this._target = null;
  }

  protected _getTargetValueCopy(): Sprite {
    return this._target?.sprite;
  }

  protected override _updateCurrentValue(srcValue: Sprite, destValue: Sprite, weight: number): void {
    this._currentValue = weight >= 1 ? destValue : srcValue;
  }

  protected override _applyValue(value: Sprite): void {
    this._target.sprite = value || this._normal;
  }
}
