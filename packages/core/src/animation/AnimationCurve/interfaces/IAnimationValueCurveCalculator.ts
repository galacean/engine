import { KeyframeTangentType, KeyframeValueType } from "../../KeyFrame";
import { IAnimationCurveCalculator } from "./IAnimationCurveCalculator";

/**
 * @internal
 */
export interface IAnimationValueCurveCalculator<T extends KeyframeTangentType, V extends KeyframeValueType>
  extends IAnimationCurveCalculator<T, V> {
  _lerpValue(src: V, dest: V, weight: number): V;
  _additiveValue(additive: V, weight: number, scource: V): V;
}
