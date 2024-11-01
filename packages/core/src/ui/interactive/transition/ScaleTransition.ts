import { UIImage } from "../../UIImage";
import { Transition } from "./Transition";

export class ScaleTransition extends Transition<number, UIImage> {
  protected override _applyValue(value: number): void {
    this._target.entity.transform.setScale(value, value, value);
  }

  protected override _getCurrentValue(): number {
    return this._target.entity.transform.scale.x;
  }

  protected override _samplingValue(srcValue: number, destValue: number, weight: number, out: number): number {
    return srcValue + (destValue - srcValue) * weight;
  }
}
