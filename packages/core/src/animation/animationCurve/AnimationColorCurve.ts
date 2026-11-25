import { Color, Vector4 } from "@galacean/engine-math";
import { TypedArray } from "../../base/Constant";
import { StaticInterfaceImplement } from "../../base/StaticInterfaceImplement";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
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
   * @param times - Keyframe timestamps in seconds
   * @param values - Packed keyframe scalars (`4` per key, or `12` per key as `[inTangent, value, outTangent]`)
   * @param hasTangents - Whether `values` includes in/out tangents for each keyframe
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
    t: number,
    duration: number,
    out: Color
  ): Color {
    const values = this._values;
    const o0 = curIndex * 12 + 4;
    const o1 = nextIndex * 12;

    const t2 = t * t;
    const t3 = t2 * t;
    const a = 2.0 * t3 - 3.0 * t2 + 1.0;
    const b = t3 - 2.0 * t2 + t;
    const c = t3 - t2;
    const d = -2.0 * t3 + 3.0 * t2;

    const p0r = values[o0];
    const p0g = values[o0 + 1];
    const p0b = values[o0 + 2];
    const p0a = values[o0 + 3];
    let t0 = values[o0 + 4];
    let t1 = values[o1];
    const r =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0r + b * t0 * duration + c * t1 * duration + d * values[o1 + 4]
        : p0r;

    t0 = values[o0 + 5];
    t1 = values[o1 + 1];
    const g =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0g + b * t0 * duration + c * t1 * duration + d * values[o1 + 5]
        : p0g;

    t0 = values[o0 + 6];
    t1 = values[o1 + 2];
    const bVal =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0b + b * t0 * duration + c * t1 * duration + d * values[o1 + 6]
        : p0b;

    t0 = values[o0 + 7];
    t1 = values[o1 + 3];
    const aVal =
      Number.isFinite(t0) && Number.isFinite(t1)
        ? a * p0a + b * t0 * duration + c * t1 * duration + d * values[o1 + 7]
        : p0a;

    return out.set(r, g, bVal, aVal);
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
    const values = this._values;
    if (this._hasTangents) {
      let offset = index * 12;
      (out.inTangent ||= new Vector4()).set(values[offset++], values[offset++], values[offset++], values[offset++]);
      (out.value ||= new Color()).set(values[offset++], values[offset++], values[offset++], values[offset++]);
      (out.outTangent ||= new Vector4()).set(values[offset++], values[offset++], values[offset++], values[offset]);
    } else {
      const offset = index * 4;
      (out.value ||= new Color()).set(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
      out.inTangent = undefined;
      out.outTangent = undefined;
    }
  }

  protected override _writeKeyAt(index: number, key: Keyframe<Color>): void {
    const values = this._values;
    const { value } = key;
    if (this._hasTangents) {
      let offset = index * 12;
      const inTangent = key.inTangent;
      if (inTangent) {
        values[offset++] = inTangent.x;
        values[offset++] = inTangent.y;
        values[offset++] = inTangent.z;
        values[offset++] = inTangent.w;
      } else {
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset++] = NaN;
      }
      values[offset++] = value.r;
      values[offset++] = value.g;
      values[offset++] = value.b;
      values[offset++] = value.a;
      const outTangent = key.outTangent;
      if (outTangent) {
        values[offset++] = outTangent.x;
        values[offset++] = outTangent.y;
        values[offset++] = outTangent.z;
        values[offset] = outTangent.w;
      } else {
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset++] = NaN;
        values[offset] = NaN;
      }
    } else {
      const offset = index * 4;
      values[offset] = value.r;
      values[offset + 1] = value.g;
      values[offset + 2] = value.b;
      values[offset + 3] = value.a;
    }
  }
}
