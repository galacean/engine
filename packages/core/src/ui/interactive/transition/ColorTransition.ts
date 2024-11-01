import { Color } from "@galacean/engine-math";
import { UIImage } from "../../UIImage";
import { Transition } from "./Transition";
import { SamplingType } from "./SamplingType";
import { CopyType } from "./CopyType";

export class ColorTransition extends Transition<Color, UIImage> {
  protected override _applyValue(value: Color): void {
    this.target.color = value;
  }

  protected override _samplingValue(srcValue: Color, destValue: Color, weight: number, out?: Color): Color {
    if (this.samplingType === SamplingType.Continuous) {
      return Color.lerp(srcValue, destValue, weight, out);
    } else {
      return weight >= 1 ? destValue : srcValue;
    }
  }

  protected override _getCurrentValue(): Color {
    return this.target.color;
  }

  constructor() {
    super();
    this.samplingType = SamplingType.Continuous;
    this.copyType = CopyType.Deep;
  }
}
