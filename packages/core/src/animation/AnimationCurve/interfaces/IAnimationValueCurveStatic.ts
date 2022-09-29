import { KeyframeTangentType, KeyframeValueType } from "../../KeyFrame";
import { IAnimationCurveStatic } from "./IAnimationCurveStatic";

/**
 * @internal
 */
export interface IAnimationValueCurveStatic<T extends KeyframeTangentType, V extends KeyframeValueType>
  extends IAnimationCurveStatic<T, V> {
  _lerpValue(src: V, dest: V, weight: number): V;
  _additiveValue(additive: V, weight: number, scource: V): V;
}
