import { KeyframeValueType, MethodParam } from "../../../Keyframe";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class MethodAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<MethodParam> {
  private _mounted: Record<string, MethodParam>;
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

  getTargetValue(): MethodParam {
    return this._mounted[this._propertyName];
  }

  setTargetValue(value: MethodParam): void {
    if (!value) return;
    this._mounted[this._propertyName] = value;
    const methodName = this._propertyName.slice(0, -2);
    for (let i = 0, n = value.length; i < n; i++) {
      (this._mounted[methodName] as any)(...value[i]);
    }
  }
}
