import { Sprite } from "../../../2d";
import { UIImage } from "../../UIImage";
import { Transition } from "./Transition";

export class SpriteTransition extends Transition<Sprite, UIImage> {
  protected override _applyValue(value: Sprite): void {
    this._target.sprite = value;
  }

  protected override _getCurrentValue(): Sprite {
    return this._target.sprite;
  }

  protected override _samplingValue(srcValue: Sprite, destValue: Sprite, weight: number, out: Sprite): Sprite {
    return weight >= 1 ? destValue : srcValue;
  }
}
