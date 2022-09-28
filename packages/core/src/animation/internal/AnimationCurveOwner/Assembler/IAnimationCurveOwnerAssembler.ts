import { KeyFrameTangentType, KeyFrameValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";

/**
 * @internal
 */
export interface IAnimationCurveOwnerAssembler<V extends KeyFrameValueType> {
  getValue(owner: AnimationCurveOwner<KeyFrameTangentType, V>): V;
  setValue(owner: AnimationCurveOwner<KeyFrameTangentType, V>, value: V): void;
}
