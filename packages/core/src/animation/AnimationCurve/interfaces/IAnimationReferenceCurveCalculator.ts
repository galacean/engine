import { KeyframeTangentType, KeyframeValueType } from "../../KeyFrame";
import { IAnimationCurveCalculator } from "./IAnimationCurveCalculator";

/**
 * @internal
 */
export interface IAnimationReferenceCurveCalculator<T extends KeyframeTangentType, V extends KeyframeValueType>
  extends IAnimationCurveCalculator<T, V> {
  _lerpValue(src: V, dest: V, weight: number, out: V): void;
  _additiveValue(additive: V, weight: number, sourceOut: V): void;
  _copyFrom(scource: V, out: V): void;
}
