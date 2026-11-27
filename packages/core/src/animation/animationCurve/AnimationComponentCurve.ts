import { MathUtil } from "@galacean/engine-math";
import type { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { TypedArray } from "../../base/Constant";
import { AnimationCurveLayerOwner } from "../internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "../internal/animationCurveOwner/AnimationCurveOwner";
import { evaluateHermiteScalar } from "../internal/AnimationCurvePack";
import { AnimationCurve } from "./AnimationCurve";

type ComponentValue = Vector2 | Vector3 | Vector4 | Color;

interface ComponentMath {
  new (): ComponentValue;
  lerp(start: ComponentValue, end: ComponentValue, t: number, out: ComponentValue): void;
  scale(value: ComponentValue, scale: number, out: ComponentValue): void;
  add(left: ComponentValue, right: ComponentValue, out: ComponentValue): void;
  subtract(left: ComponentValue, right: ComponentValue, out: ComponentValue): void;
}

/** @internal */
export abstract class AnimationComponentCurve<V extends ComponentValue> extends AnimationCurve<V> {
  /** @internal */
  static readonly _componentType: ComponentMath;
  /** @internal */
  static readonly _isCopyMode = true;
  /** @internal */
  static readonly _supportInterpolationMode = true;

  protected declare _values: TypedArray;

  /** @internal */
  static _initializeOwner<T extends ComponentValue>(
    this: { readonly _componentType: new () => T },
    owner: AnimationCurveOwner<T>
  ): void {
    const Component = this._componentType;
    owner.defaultValue = new Component();
    owner.fixedPoseValue = new Component();
    owner.baseEvaluateData.value = new Component();
    owner.crossEvaluateData.value = new Component();
  }

  /** @internal */
  static _initializeLayerOwner(owner: AnimationCurveLayerOwner): void {
    owner.finalValue = new this._componentType();
  }

  /** @internal */
  static _lerpValue<T extends ComponentValue>(source: T, target: T, weight: number, out?: T): T {
    this._componentType.lerp(source, target, weight, out!);
    return out!;
  }

  /** @internal */
  static _additiveValue<T extends ComponentValue>(value: T, weight: number, out?: T): T {
    const Component = this._componentType;
    Component.scale(value, weight, value);
    Component.add(out!, value, out!);
    return out!;
  }

  /** @internal */
  static _subtractValue<T extends ComponentValue>(source: T, base: T, out?: T): T {
    this._componentType.subtract(source, base, out!);
    return out!;
  }

  /** @internal */
  static _getZeroValue<T extends ComponentValue>(out?: T): T {
    out!.set(0, 0, 0, 0);
    return out!;
  }

  /** @internal */
  static _setValue<T extends ComponentValue & { copyFrom(value: T): void }>(source: T, out: T): T {
    out.copyFrom(source);
    return out;
  }

  constructor() {
    super();
    const Component = (this.constructor as typeof AnimationComponentCurve)._componentType;
    this._evaluateData.value = new Component() as V;
  }

  protected override _evaluateKey(index: number, out: V): V {
    const width = this._valueSize;
    const offset = this._hasTangents ? index * width * 3 + width : index * width;
    out.copyFromArray(this._values, offset);
    return out;
  }

  protected override _evaluateLinear(curIndex: number, nextIndex: number, t: number, out: V): V {
    const values = this._values;
    const width = this._valueSize;
    const stride = this._hasTangents ? width * 3 : width;
    const valueOffset = this._hasTangents ? width : 0;
    const start = curIndex * stride + valueOffset;
    const end = nextIndex * stride + valueOffset;
    out.set(
      MathUtil.lerp(values[start], values[end], t),
      MathUtil.lerp(values[start + 1], values[end + 1], t),
      width >= 3 ? MathUtil.lerp(values[start + 2], values[end + 2], t) : 0,
      width === 4 ? MathUtil.lerp(values[start + 3], values[end + 3], t) : 0
    );
    return out;
  }

  protected override _evaluateHermite(
    curIndex: number,
    nextIndex: number,
    a: number,
    bd: number,
    cd: number,
    d: number,
    out: V
  ): V {
    const values = this._values;
    const width = this._valueSize;
    const stride = width * 3;
    const start = curIndex * stride + width;
    const end = nextIndex * stride + width;
    const outTangent = start + width;
    const inTangent = end - width;
    out.set(
      evaluateHermiteScalar(values[start], values[outTangent], values[inTangent], values[end], a, bd, cd, d),
      evaluateHermiteScalar(
        values[start + 1],
        values[outTangent + 1],
        values[inTangent + 1],
        values[end + 1],
        a,
        bd,
        cd,
        d
      ),
      width >= 3
        ? evaluateHermiteScalar(
            values[start + 2],
            values[outTangent + 2],
            values[inTangent + 2],
            values[end + 2],
            a,
            bd,
            cd,
            d
          )
        : 0,
      width === 4
        ? evaluateHermiteScalar(
            values[start + 3],
            values[outTangent + 3],
            values[inTangent + 3],
            values[end + 3],
            a,
            bd,
            cd,
            d
          )
        : 0
    );
    return out;
  }
}
