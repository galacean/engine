import { Sprite } from "@galacean/engine";
import { Image } from "../../advanced/Image";
import { Transition } from "./Transition";

/**
 * Sprite transition.
 */
export class SpriteTransition extends Transition<Sprite, Image> {
  /**
   * @internal
   * The clone gate shares nested state sprites without counting; pair the acquisition here
   * with the release in `Transition.destroy` (class-local ownership).
   */
  _cloneTo(target: SpriteTransition): void {
    // @ts-ignore
    target._normal?._addReferCount(1);
    // @ts-ignore
    target._hover?._addReferCount(1);
    // @ts-ignore
    target._pressed?._addReferCount(1);
    // @ts-ignore
    target._disabled?._addReferCount(1);
  }

  protected _getTargetValueCopy(): Sprite {
    return this._target?.sprite;
  }

  protected override _updateCurrentValue(srcValue: Sprite, destValue: Sprite, weight: number): void {
    this._currentValue = weight >= 1 ? destValue : srcValue;
  }

  protected override _applyValue(value: Sprite): void {
    this._target.sprite = value;
  }
}
