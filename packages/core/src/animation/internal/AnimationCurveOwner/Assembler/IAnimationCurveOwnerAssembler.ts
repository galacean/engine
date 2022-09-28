import { KeyframeTangentType, KeyframeValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";

/**
 * @internal
 */
export interface IAnimationCurveOwnerAssembler<V extends KeyframeValueType> {
  initialization(owner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>): void;
  getValue(): V;
  setValue(value: V): void;
}
