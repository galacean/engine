import { Color, Quaternion, Rect, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { TypedArray } from "../../base/Constant";
import { Keyframe } from "../Keyframe";

/**
 * Evaluate one scalar cubic Hermite component using out-tangent `t0`, next in-tangent `t1`, and precomputed basis terms.
 * Falls back to step hold (`p0`) when either tangent is non-finite.
 */
export function evaluateHermiteScalar(
  p0: number,
  t0: number,
  t1: number,
  p1: number,
  a: number,
  bd: number,
  cd: number,
  d: number
): number {
  return Number.isFinite(t0) && Number.isFinite(t1) ? a * p0 + bd * t0 + cd * t1 + d * p1 : p0;
}

type ArrayValue = Color | Quaternion | Vector2 | Vector3 | Vector4;
export type NumericValue = ArrayValue | Rect | number | number[] | Float32Array;

export function readObjectKey<V extends ArrayValue, T extends Vector2 | Vector3 | Vector4>(
  values: TypedArray,
  width: number,
  hasTangents: boolean,
  index: number,
  out: Keyframe<V, T>,
  Value: new () => V,
  Tangent: new () => T
): void {
  const offset = hasTangents ? index * width * 3 + width : index * width;
  (out.value ||= new Value()).copyFromArray(values, offset);
  if (hasTangents) {
    (out.inTangent ||= new Tangent()).copyFromArray(values, offset - width);
    (out.outTangent ||= new Tangent()).copyFromArray(values, offset + width);
  } else {
    out.inTangent = undefined;
    out.outTangent = undefined;
  }
}

export function writeKeyComponents(
  values: Float64Array,
  offset: number,
  width: number,
  value: NumericValue | undefined
): void {
  if (value === undefined) {
    values.fill(NaN, offset, offset + width);
  } else if (typeof value === "number") {
    values[offset] = value;
  } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    for (let i = 0; i < width; i++) {
      values[offset + i] = value[i];
    }
  } else if (value instanceof Rect) {
    values[offset] = value.x;
    values[offset + 1] = value.y;
    values[offset + 2] = value.width;
    values[offset + 3] = value.height;
  } else {
    value.copyToArray(values, offset);
  }
}

/**
 * Evaluate a variable-width numeric Hermite segment into `out[0..count-1]`.
 */
export function evaluateHermiteArray(
  values: TypedArray,
  valueSize: number,
  curIndex: number,
  nextIndex: number,
  a: number,
  bd: number,
  cd: number,
  d: number,
  out: Float32Array | number[],
  count: number
): void {
  const stride = valueSize * 3;
  const o0 = curIndex * stride + valueSize;
  const o0Out = o0 + valueSize;
  const o1 = nextIndex * stride;
  const o1Val = o1 + valueSize;
  for (let i = 0; i < count; ++i) {
    out[i] = evaluateHermiteScalar(values[o0 + i], values[o0Out + i], values[o1 + i], values[o1Val + i], a, bd, cd, d);
  }
}

/**
 * Subtract keyframe 0's components (up to `min(out.length, valueSize)`) from `out` in place for variable-width numeric curves.
 */
export function subtractArrayFirstKey<V extends Float32Array | number[]>(
  values: TypedArray,
  valueSize: number,
  hasTangents: boolean,
  out: V
): V {
  const offset = hasTangents ? valueSize : 0;
  const count = out.length < valueSize ? out.length : valueSize;
  for (let i = 0; i < count; ++i) {
    out[i] -= values[offset + i];
  }
  return out;
}

/**
 * Cold-path read for variable-width numeric curves (`Float32Array` and `number[]`).
 * Callers must pass a `valueSize`-length `Float32Array` or reusable `number[]` as `dstValue`.
 */
export function readArrayKey<V extends Float32Array | number[]>(
  values: TypedArray,
  valueSize: number,
  hasTangents: boolean,
  index: number,
  out: { value: V; inTangent?: number[]; outTangent?: number[] },
  dstValue: V
): void {
  const stride = hasTangents ? valueSize * 3 : valueSize;
  const offset = index * stride + (hasTangents ? valueSize : 0);
  out.value = dstValue;
  for (let i = 0; i < valueSize; i++) {
    dstValue[i] = values[offset + i];
  }
  if (Array.isArray(dstValue)) {
    dstValue.length = valueSize;
  }

  if (hasTangents) {
    const inOffset = offset - valueSize;
    const outOffset = offset + valueSize;
    const inTangent = (out.inTangent ||= []);
    const outTangent = (out.outTangent ||= []);
    for (let i = 0; i < valueSize; i++) {
      inTangent[i] = values[inOffset + i];
      outTangent[i] = values[outOffset + i];
    }
    inTangent.length = valueSize;
    outTangent.length = valueSize;
  } else {
    out.inTangent = undefined;
    out.outTangent = undefined;
  }
}
