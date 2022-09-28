export interface IAnimationCurveStatic<V> {
  _lerpValue(srcValue: V, destValue: V, crossWeight: number, out: V): V;
  _additiveValue(value: V, weight: number, out: V): void;
  _copyFrom(scource: V, out: V): void;
}
