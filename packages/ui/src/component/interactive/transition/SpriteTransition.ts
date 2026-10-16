import { Sprite } from "@galacean/engine";
import { Image } from "../../advanced/Image";
import { Transition } from "./Transition";

/**
 * Sprite transition.
 */
export class SpriteTransition extends Transition<Sprite | null, Image> {
  protected _getTargetValueCopy(): Sprite | null {
    return this._target?.sprite;
  }

  protected override _updateCurrentValue(srcValue: Sprite | null, destValue: Sprite | null, weight: number): void {
    this._currentValue = weight >= 1 ? destValue : srcValue;
  }

  protected override _applyValue(value: Sprite | null): void {
    this._target.sprite = value;
  }
}
