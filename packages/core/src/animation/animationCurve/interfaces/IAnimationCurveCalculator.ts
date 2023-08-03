import { AnimationCurveLayerOwner } from "../../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../../internal/animationCurveOwner/AnimationCurveOwner";
import { Keyframe, KeyframeValueType } from "../../Keyframe";

/**
 * @internal
 */
export interface IAnimationCurveCalculator<V extends KeyframeValueType> {
  _isReferenceType: boolean;
  _isInterpolationType: boolean;

  _initializeOwner(owner: AnimationCurveOwner<V>);
  _initializeLayerOwner(owner: AnimationCurveLayerOwner);

  _lerpValue(src: V, dest: V, weight: number, out?: V): V;
  _additiveValue(additive: V, weight: number, srcOut: V): V;
  _subtractValue(src: V, base: V, out?: V): V;
  _getZeroValue(out?: V): V;
  _copyValue(src: V, out?: V): V;
  _hermiteInterpolationValue(frame: Keyframe<V>, nextFrame: Keyframe<V>, t: number, dur: number, out?: V): V;
}
