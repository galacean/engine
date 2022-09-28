import { KeyFrameTangentType, KeyFrameValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";

/**
 * @internal
 */
export interface IAnimationCurveOwnerAssembler<V extends KeyFrameValueType> {
  initialization(owner: AnimationCurveOwner<KeyFrameTangentType, KeyFrameValueType>): void;
  getValue(): V;
  setValue(value: V): void;
}
