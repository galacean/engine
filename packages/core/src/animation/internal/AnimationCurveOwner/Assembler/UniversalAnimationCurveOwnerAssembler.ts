import { KeyframeValueType } from "../../../Keyframe";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class UniversalAnimationCurveOwnerAssembler<V extends KeyframeValueType>
  implements IAnimationCurveOwnerAssembler<V>
{
  private _owner: AnimationCurveOwner<KeyframeValueType>;

  initialize(owner: AnimationCurveOwner<KeyframeValueType>): void {
    this._owner = owner;
  }

  getTargetValue(): V {
    const { _owner: owner } = this;
    let mounted: any = owner.component;
    const properties = (owner.property as string).split(".");
    const endIndex = properties.length - 1;
    for (let i = 0; i < endIndex; i++) {
      mounted = mounted[properties[i]];
    }
    const propertyName = properties[endIndex];
    return mounted[propertyName];
  }

  setTargetValue(value: V): void {
    const { _owner: owner } = this;
    let mounted: any = owner.component;
    const properties = (owner.property as string).split(".");
    const endIndex = properties.length - 1;
    for (let i = 0; i < endIndex; i++) {
      mounted = mounted[properties[i]];
    }
    const propertyName = properties[endIndex];
    mounted[propertyName] = value;
  }
}
