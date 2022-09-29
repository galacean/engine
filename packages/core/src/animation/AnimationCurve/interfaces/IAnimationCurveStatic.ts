import { AnimationCurveOwner } from "../../internal/AnimationCurveOwner/AnimationCurveOwner";
import { KeyframeTangentType, KeyframeValueType } from "../../KeyFrame";

/**
 * @internal
 */
export interface IAnimationCurveStatic<T extends KeyframeTangentType, V extends KeyframeValueType> {
  _isReferenceType: boolean;

  _initializeOwner(owner: AnimationCurveOwner<T, V>);
}
