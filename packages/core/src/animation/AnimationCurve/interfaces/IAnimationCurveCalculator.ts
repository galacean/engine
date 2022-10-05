import { AnimationCurveOwner } from "../../internal/AnimationCurveOwner/AnimationCurveOwner";
import { Keyframe, KeyframeValueType } from "../../Keyframe";

/**
 * @internal
 */
export interface IAnimationCurveCalculator<V extends KeyframeValueType> {
  _isReferenceType: boolean;

  _initializeOwner(owner: AnimationCurveOwner<V>);

  _lerpValue(src: V, dest: V, weight: number, out?: V): V;
  _additiveValue(additive: V, weight: number, sourceOut: V): V;
  _copyFromValue(scource: V, out?: V): V;
  _hermiteInterpolationValue(frame: Keyframe<V>, nextFrame: Keyframe<V>, t: number, dur: number, out?: V): V;
}
