import { KeyframeValueType } from "../../../Keyframe";
import type { AnimationCurveOwner } from "../AnimationCurveOwner";

/**
 * @internal
 */
export interface IAnimationCurveOwnerAssembler<V extends KeyframeValueType> {
  initialize(owner: AnimationCurveOwner<KeyframeValueType>): void;
  getTargetValue(): V;
  setTargetValue(value: V): void;
}
