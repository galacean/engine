import { Vector3 } from "@galacean/engine-math";
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
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector3>>()
export class AnimationVector3Curve extends AnimationCurve<Vector3> {
  /** @internal */
  static readonly _isCopyMode = true;
  /** @internal */
  static readonly _supportInterpolationMode = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Vector3>): void {
    owner.defaultValue = new Vector3();
    owner.fixedPoseValue = new Vector3();
    owner.baseEvaluateData.value = new Vector3();
    owner.crossEvaluateData.value = new Vector3();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Vector3();
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Vector3, destValue: Vector3, weight: number, out: Vector3): Vector3 {
    Vector3.lerp(srcValue, destValue, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Vector3, weight: number, out: Vector3): Vector3 {
    Vector3.scale(value, weight, value);
    Vector3.add(out, value, out);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Vector3, base: Vector3, out: Vector3): Vector3 {
    Vector3.subtract(src, base, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Vector3): Vector3 {
    out.set(0, 0, 0);
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Vector3, out: Vector3): Vector3 {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super(3);
    this._evaluateData.value = new Vector3();
  }

  /**
   * Replace all keyframes with packed `Vector3` buffers.
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Packed scalars (`3` per key, or `9` per key interleaved as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   * @throws Error If `values.length` does not match `times.length * 3` (`times.length * 9` when `hasTangents` is true)
   * @remarks For non-empty inputs, `times` and `values` are retained directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamps; callers must pass non-decreasing `times` and must not mutate retained buffers.
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 3, hasTangents);
  }

  protected override _evaluateKey(index: number, out: Vector3): Vector3 {
    const values = this._values;
    const offset = this._hasTangents ? index * 9 + 3 : index * 3;
    return out.set(values[offset], values[offset + 1], values[offset + 2]);
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: Vector3): Vector3 {
    const values = this._values;
    const stride = this._hasTangents ? 9 : 3;
    const valueOffset = this._hasTangents ? 3 : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    const x0 = values[o0];
    const y0 = values[o0 + 1];
    const z0 = values[o0 + 2];
    return out.set(x0 + (values[o1] - x0) * t, y0 + (values[o1 + 1] - y0) * t, z0 + (values[o1 + 2] - z0) * t);
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    a: number,
    bd: number,
    cd: number,
    d: number,
    out: Vector3
  ): Vector3 {
    const values = this._values;
    const o0 = curIndex * 9 + 3;
    const o1 = nextIndex * 9;
    return out.set(
      evaluateHermiteScalar(values[o0], values[o0 + 3], values[o1], values[o1 + 3], a, bd, cd, d),
      evaluateHermiteScalar(values[o0 + 1], values[o0 + 4], values[o1 + 1], values[o1 + 4], a, bd, cd, d),
      evaluateHermiteScalar(values[o0 + 2], values[o0 + 5], values[o1 + 2], values[o1 + 5], a, bd, cd, d)
    );
  }

  protected override _subtractFirstKey(out: Vector3): Vector3 {
    const values = this._values;
    const offset = this._hasTangents ? 3 : 0;
    return out.set(out.x - values[offset], out.y - values[offset + 1], out.z - values[offset + 2]);
  }

  protected override _readKeyAt(index: number, out: Keyframe<Vector3>): void {
    const values = this._values;
    if (this._hasTangents) {
      const base = index * 9;
      (out.inTangent ||= new Vector3()).set(values[base], values[base + 1], values[base + 2]);
      (out.value ||= new Vector3()).set(values[base + 3], values[base + 4], values[base + 5]);
      (out.outTangent ||= new Vector3()).set(values[base + 6], values[base + 7], values[base + 8]);
    } else {
      const base = index * 3;
      (out.value ||= new Vector3()).set(values[base], values[base + 1], values[base + 2]);
      out.inTangent = undefined;
      out.outTangent = undefined;
    }
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Vector3>): void {
    const values = this._values;
    const { value, inTangent, outTangent } = key;
    if (this._hasTangents) {
      const base = index * 9;
      values[base] = inTangent ? inTangent.x : NaN;
      values[base + 1] = inTangent ? inTangent.y : NaN;
      values[base + 2] = inTangent ? inTangent.z : NaN;
      values[base + 3] = value.x;
      values[base + 4] = value.y;
      values[base + 5] = value.z;
      values[base + 6] = outTangent ? outTangent.x : NaN;
      values[base + 7] = outTangent ? outTangent.y : NaN;
      values[base + 8] = outTangent ? outTangent.z : NaN;
    } else {
      const base = index * 3;
      values[base] = value.x;
      values[base + 1] = value.y;
      values[base + 2] = value.z;
    }
  }
}
