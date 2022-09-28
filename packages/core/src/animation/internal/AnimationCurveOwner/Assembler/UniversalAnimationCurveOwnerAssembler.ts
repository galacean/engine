import { KeyframeTangentType, KeyframeValueType } from "../../../KeyFrame";
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

  initialize(owner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>): void {
    let mounted: any = owner.component;
    const properties = (owner.property as string).split(".");
    for (let i = 0, n = properties.length; i < n - 1; i++) {
      mounted = mounted[properties[i]];
    }
    this._mounted = mounted;
    this._propertyName = properties[properties.length - 1];
  }

  getTargetValue(): V {
    return this._mounted[this._propertyName];
  }

  setTargetValue(value: V): void {
    this._mounted[this._propertyName] = value;
  }
}
