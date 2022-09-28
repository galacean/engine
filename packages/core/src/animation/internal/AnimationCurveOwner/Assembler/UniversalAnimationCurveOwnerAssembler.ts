import { KeyFrameTangentType, KeyFrameValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class UniversalAnimationCurveOwnerAssembler<V extends KeyFrameValueType>
  implements IAnimationCurveOwnerAssembler<V>
{
  getValue(owner: AnimationCurveOwner<KeyFrameTangentType, V>): V {
    const propertyReference = owner._propertyReference;
    const originValue = propertyReference.mounted[propertyReference.propertyName];
    return originValue;
  }
  setValue(owner: AnimationCurveOwner<KeyFrameTangentType, V>, value: V): void {
    const propertyReference = owner._propertyReference;
    propertyReference.mounted[propertyReference.propertyName] = value;
  }
}
