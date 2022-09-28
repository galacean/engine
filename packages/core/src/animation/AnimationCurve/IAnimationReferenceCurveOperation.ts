export interface IAnimationReferenceCurveOperation<V> {
  _lerpValue(srcValue: V, destValue: V, crossWeight: number, out: V): void;
  _additiveValue(additive: V, weight: number, sourceOut: V): void;
  _copyFrom(scource: V, out: V): void;
}
