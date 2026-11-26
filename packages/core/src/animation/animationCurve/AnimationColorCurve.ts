import { Color } from "@galacean/engine-math";
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
@StaticInterfaceImplement<IAnimationCurveCalculator<Color>>()
export class AnimationColorCurve extends AnimationCurve<Color> {
  /** @internal */
  static _isCopyMode: boolean = true;
  /** @internal */
  static _supportInterpolationMode: boolean = true;

  /**
   * @internal
   */
  static _initializeOwner(owner: AnimationCurveOwner<Color>): void {
    owner.defaultValue = new Color();
    owner.fixedPoseValue = new Color();
    owner.baseEvaluateData.value = new Color();
    owner.crossEvaluateData.value = new Color();
  }

  /**
   * @internal
   */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new Color();
  }

  /**
   * @internal
   */
  static _lerpValue(srcValue: Color, destValue: Color, weight: number, out: Color): Color {
    Color.lerp(srcValue, destValue, weight, out);
    return out;
  }

  /**
   * @internal
   */
  static _subtractValue(src: Color, base: Color, out: Color): Color {
    Color.subtract(src, base, out);
    return out;
  }

  /**
   * @internal
   */
  static _getZeroValue(out: Color) {
    out.set(0, 0, 0, 0);
    return out;
  }

  /**
   * @internal
   */
  static _additiveValue(value: Color, weight: number, out: Color): Color {
    Color.scale(value, weight, value);
    Color.add(out, value, out);
    return out;
  }

  /**
   * @internal
   */
  static _setValue(source: Color, out: Color): Color {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super(4);
    this._evaluateData.value = new Color();
  }

  /**
   * Replace all keyframes with packed `Color` buffers (`r, g, b, a`).
   * @param times - Keyframe timestamps in seconds; must be sorted in ascending (non-decreasing) order
   * @param values - Packed scalars (`4` per key, or `12` per key interleaved as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
   * @throws Error If `values.length` does not match `times.length` and the expected stride
   * @remarks Non-empty inputs retain `times` and `values` directly by reference (copy-on-write on `addKey`, `setKey`, or `removeKey`) without validating or sorting timestamp order; callers must pass non-decreasing `times` and must not mutate retained buffers.
   */
  setKeys(times: TypedArray, values: TypedArray, hasTangents: boolean = false): void {
    this._setNumericKeys(times, values, 4, hasTangents);
  }

  protected override _evaluateKey(index: number, out: Color): Color {
    const values = this._values;
    const offset = this._hasTangents ? index * 12 + 4 : index * 4;
    return out.set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: Color): Color {
    const values = this._values;
    const stride = this._hasTangents ? 12 : 4;
    const valueOffset = this._hasTangents ? 4 : 0;
    const o0 = curIndex * stride + valueOffset;
    const o1 = nextIndex * stride + valueOffset;
    const r0 = values[o0];
    const g0 = values[o0 + 1];
    const b0 = values[o0 + 2];
    const a0 = values[o0 + 3];
    return out.set(
      r0 + (values[o1] - r0) * t,
      g0 + (values[o1 + 1] - g0) * t,
      b0 + (values[o1 + 2] - b0) * t,
      a0 + (values[o1 + 3] - a0) * t
    );
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    a: number,
    bd: number,
    cd: number,
    d: number,
    out: Color
  ): Color {
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

  protected override _subtractFirstKey(out: Color): Color {
    const values = this._values;
    const offset = this._hasTangents ? 4 : 0;
    return out.set(
      out.r - values[offset],
      out.g - values[offset + 1],
      out.b - values[offset + 2],
      out.a - values[offset + 3]
    );
  }

  protected override _readKeyAt(index: number, out: Keyframe<Color>): void {
    readVec4Key(this._values, this._hasTangents, index, out, out.value || new Color());
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Color>): void {
    const { value } = key;
    writeVec4Key(
      this._values,
      this._hasTangents,
      index,
      value.r,
      value.g,
      value.b,
      value.a,
      key.inTangent,
      key.outTangent
    );
  }
}
