import { Sprite } from "../../../2d";
import { Image } from "../../Image";
import { Transition } from "./Transition";

export class SpriteTransition extends Transition<Sprite, Image> {
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
