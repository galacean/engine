import { AnimationCurveOwner } from "../../internal/AnimationCurveOwner/AnimationCurveOwner";
import { KeyframeValueType } from "../../Keyframe";

/**
 * @internal
 */
export interface IAnimationCurveCalculator<V extends KeyframeValueType> {
  _isReferenceType: boolean;

  _initializeOwner(owner: AnimationCurveOwner<V>);
}
