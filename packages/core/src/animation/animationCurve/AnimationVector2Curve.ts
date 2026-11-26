import { Vector2 } from "@galacean/engine-math";
import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { evaluateHermiteScalar } from "../internal/AnimationCurvePack";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector2>>()
export class AnimationVector2Curve extends AnimationCurve<Vector2> {
  /** @internal */
  static readonly _isCopyMode = true;
  /** @internal */
  static readonly _supportInterpolationMode = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Vector2>): void {
    owner.defaultValue = new Vector2();
    owner.fixedPoseValue = new Vector2();
    owner.baseEvaluateData.value = new Vector2();
    owner.crossEvaluateData.value = new Vector2();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Vector2();
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Vector2, destValue: Vector2, weight: number, out: Vector2): Vector2 {
    Vector2.lerp(srcValue, destValue, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Vector2, weight: number, out: Vector2): Vector2 {
    Vector2.scale(value, weight, value);
    Vector2.add(out, value, out);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Vector2, base: Vector2, out: Vector2): Vector2 {
    Vector2.subtract(src, base, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Vector2): Vector2 {
    out.set(0, 0);
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Vector2, out: Vector2): Vector2 {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super(2);
    this._evaluateData.value = new Vector2();
  }

  /**
   * Replace all keyframes with packed `Vector2` buffers.
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Packed scalars (`2` per key, or `6` per key interleaved as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   * @throws Error If `values.length` does not match `times.length * 2` (`times.length * 6` when `hasTangents` is true)
   * @remarks For non-empty inputs, `times` and `values` are retained directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamps; callers must pass non-decreasing `times` and must not mutate retained buffers.
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 2, hasTangents);
  }

  protected override _evaluateKey(index: number, out: Vector2): Vector2 {
    const values = this._values;
    const offset = this._hasTangents ? index * 6 + 2 : index * 2;
    return out.set(values[offset], values[offset + 1]);
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: Vector2): Vector2 {
    const values = this._values;
    const stride = this._hasTangents ? 6 : 2;
    const valueOffset = this._hasTangents ? 2 : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    const x0 = values[o0];
    const y0 = values[o0 + 1];
    return out.set(x0 + (values[o1] - x0) * t, y0 + (values[o1 + 1] - y0) * t);
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    a: number,
    bd: number,
    cd: number,
    d: number,
    out: Vector2
  ): Vector2 {
    const values = this._values;
    const o0 = curIndex * 6 + 2;
    const o1 = nextIndex * 6;
    return out.set(
      evaluateHermiteScalar(values[o0], values[o0 + 2], values[o1], values[o1 + 2], a, bd, cd, d),
      evaluateHermiteScalar(values[o0 + 1], values[o0 + 3], values[o1 + 1], values[o1 + 3], a, bd, cd, d)
    );
  }

  protected override _subtractFirstKey(out: Vector2): Vector2 {
    const values = this._values;
    const offset = this._hasTangents ? 2 : 0;
    return out.set(out.x - values[offset], out.y - values[offset + 1]);
  }

  protected override _readKeyAt(index: number, out: Keyframe<Vector2>): void {
    const values = this._values;
    if (this._hasTangents) {
      const base = index * 6;
      (out.inTangent ||= new Vector2()).set(values[base], values[base + 1]);
      (out.value ||= new Vector2()).set(values[base + 2], values[base + 3]);
      (out.outTangent ||= new Vector2()).set(values[base + 4], values[base + 5]);
    } else {
      const base = index * 2;
      (out.value ||= new Vector2()).set(values[base], values[base + 1]);
      out.inTangent = undefined;
      out.outTangent = undefined;
    }
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Vector2>): void {
    const values = this._values;
    const { value, inTangent, outTangent } = key;
    if (this._hasTangents) {
      const base = index * 6;
      values[base] = inTangent ? inTangent.x : NaN;
      values[base + 1] = inTangent ? inTangent.y : NaN;
      values[base + 2] = value.x;
      values[base + 3] = value.y;
      values[base + 4] = outTangent ? outTangent.x : NaN;
      values[base + 5] = outTangent ? outTangent.y : NaN;
    } else {
      const base = index * 2;
      values[base] = value.x;
      values[base + 1] = value.y;
    }
  }
}
