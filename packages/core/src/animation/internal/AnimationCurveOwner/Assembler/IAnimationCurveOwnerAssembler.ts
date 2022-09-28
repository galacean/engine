import { KeyframeTangentType, KeyframeValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";

/**
 * @internal
 */
export interface IAnimationCurveOwnerAssembler<V extends KeyframeValueType> {
  initialize(owner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>): void;
  getTargetValue(): V;
  setTargetValue(value: V): void;
}
