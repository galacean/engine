import { AnimationCurveLayerOwner } from "../../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../../internal/animationCurveOwner/AnimationCurveOwner";
import { KeyframeValueType } from "../../Keyframe";

/**
 * @internal
 */
export type IAnimationCurveCalculator<V extends KeyframeValueType> = {
  readonly _keyValueSize: number | null;
  readonly _supportInterpolationMode: boolean;

  _initializeOwner(owner: AnimationCurveOwner<V>): void;

  // Lerp need
  _lerpValue?(src: V, dest: V, weight: number, out?: V): V;
  _additiveValue?(additive: V, weight: number, srcOut: V): V;
  _subtractValue?(src: V, base: V, out?: V): V;
  _getZeroValue?(out?: V): V;
} & (
  | { readonly _isCopyMode: false }
  | {
      readonly _isCopyMode: true;
      _initializeLayerOwner(owner: AnimationCurveLayerOwner): void;
      _setValue(src: V, out: V): V;
    }
);
