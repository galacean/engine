import { Vector4 } from "@galacean/engine-math";
import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { evaluateHermiteScalar, readVec4Key, writeVec4Key } from "../internal/AnimationCurvePack";
import { Keyframe } from "../Keyframe";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./interfaces/IAnimationCurveCalculator";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
@StaticInterfaceImplement<IAnimationCurveCalculator<Vector4>>()
export class AnimationVector4Curve extends AnimationCurve<Vector4> {
  /** @internal */
  static readonly _isCopyMode = true;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Vector4>): void {
    owner.defaultValue = new Vector4();
    owner.fixedPoseValue = new Vector4();
    owner.baseEvaluateData.value = new Vector4();
    owner.crossEvaluateData.value = new Vector4();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Vector4();
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Vector4, destValue: Vector4, weight: number, out: Vector4): Vector4 {
    Vector4.lerp(srcValue, destValue, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Vector4, weight: number, out: Vector4): Vector4 {
    Vector4.scale(value, weight, value);
    Vector4.add(out, value, out);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Vector4, base: Vector4, out: Vector4): Vector4 {
    Vector4.subtract(src, base, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Vector4): Vector4 {
    out.set(0, 0, 0, 0);
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Vector4, out: Vector4): Vector4 {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super(4);
    this._evaluateData.value = new Vector4();
  }

  /**
   * Replace all keyframes with packed `Vector4` buffers (`x, y, z, w`).
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Packed scalars (`4` per key, or `12` per key interleaved as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   * @throws Error If `values.length` does not match `times.length * 4` (`times.length * 12` when `hasTangents` is true)
   * @remarks For non-empty inputs, `times` and `values` are retained directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamps; callers must pass non-decreasing `times` and must not mutate retained buffers.
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 4, hasTangents);
  }

  protected override _evaluateKey(index: number, out: Vector4): Vector4 {
    const values = this._values;
    const offset = this._hasTangents ? index * 12 + 4 : index * 4;
    return out.set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: Vector4): Vector4 {
    const values = this._values;
    const stride = this._hasTangents ? 12 : 4;
    const valueOffset = this._hasTangents ? 4 : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    const x0 = values[o0];
    const y0 = values[o0 + 1];
    const z0 = values[o0 + 2];
    const w0 = values[o0 + 3];
    return out.set(
      x0 + (values[o1] - x0) * t,
      y0 + (values[o1 + 1] - y0) * t,
      z0 + (values[o1 + 2] - z0) * t,
      w0 + (values[o1 + 3] - w0) * t
    );
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    a: number,
    bd: number,
    cd: number,
    d: number,
    out: Vector4
  ): Vector4 {
    const values = this._values;
    const o0 = curIndex * 12 + 4;
    const o1 = nextIndex * 12;
    return out.set(
      evaluateHermiteScalar(values[o0], values[o0 + 4], values[o1], values[o1 + 4], a, bd, cd, d),
      evaluateHermiteScalar(values[o0 + 1], values[o0 + 5], values[o1 + 1], values[o1 + 5], a, bd, cd, d),
      evaluateHermiteScalar(values[o0 + 2], values[o0 + 6], values[o1 + 2], values[o1 + 6], a, bd, cd, d),
      evaluateHermiteScalar(values[o0 + 3], values[o0 + 7], values[o1 + 3], values[o1 + 7], a, bd, cd, d)
    );
  }

  protected override _subtractFirstKey(out: Vector4): Vector4 {
    const values = this._values;
    const offset = this._hasTangents ? 4 : 0;
    return out.set(
      out.x - values[offset],
      out.y - values[offset + 1],
      out.z - values[offset + 2],
      out.w - values[offset + 3]
    );
  }

  protected override _readKeyAt(index: number, out: Keyframe<Vector4>): void {
    readVec4Key(this._values, this._hasTangents, index, out, out.value || new Vector4());
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Vector4>): void {
    const { value } = key;
    writeVec4Key(
      this._values,
      this._hasTangents,
      index,
      value.x,
      value.y,
      value.z,
      value.w,
      key.inTangent,
      key.outTangent
    );
  }
}
