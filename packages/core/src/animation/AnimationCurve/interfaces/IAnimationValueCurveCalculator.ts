import { KeyframeValueType } from "../../KeyFrame";
import { IAnimationCurveCalculator } from "./IAnimationCurveCalculator";

/**
 * @internal
 */
export interface IAnimationValueCurveCalculator<V extends KeyframeValueType> extends IAnimationCurveCalculator<V> {
  _lerpValue(src: V, dest: V, weight: number): V;
  _additiveValue(additive: V, weight: number, scource: V): V;
}
