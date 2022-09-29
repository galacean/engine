import { KeyframeTangentType, KeyframeValueType } from "../../KeyFrame";
import { IAnimationCurveStatic } from "./IAnimationCurveStatic";

/**
 * @internal
 */
export interface IAnimationReferenceCurveStatic<T extends KeyframeTangentType, V extends KeyframeValueType>
  extends IAnimationCurveStatic<T, V> {
  _lerpValue(src: V, dest: V, weight: number, out: V): void;
  _additiveValue(additive: V, weight: number, sourceOut: V): void;
  _copyFrom(scource: V, out: V): void;
}
