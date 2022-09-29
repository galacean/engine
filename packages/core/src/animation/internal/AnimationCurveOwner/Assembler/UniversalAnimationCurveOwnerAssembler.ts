import { KeyframeValueType } from "../../../Keyframe";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class UniversalAnimationCurveOwnerAssembler<V extends KeyframeValueType>
  implements IAnimationCurveOwnerAssembler<V>
{
  private _mounted: Record<string, V>;
  private _propertyName: string;

  initialize(owner: AnimationCurveOwner<KeyframeValueType>): void {
    let mounted: any = owner.component;
    const properties = (owner.property as string).split(".");
    const endIndex = properties.length - 1;
    for (let i = 0; i < endIndex; i++) {
      mounted = mounted[properties[i]];
    }
    this._mounted = mounted;
    this._propertyName = properties[endIndex];
  }

  getTargetValue(): V {
    return this._mounted[this._propertyName];
  }

  setTargetValue(value: V): void {
    this._mounted[this._propertyName] = value;
  }
}
