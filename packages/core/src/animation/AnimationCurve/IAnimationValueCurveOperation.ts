export interface IAnimationValueCurveOperation<V> {
  _lerpValue(srcValue: V, destValue: V, crossWeight: number): V;
  _additiveValue(value: V, weight: number, scource: V): V;
}
