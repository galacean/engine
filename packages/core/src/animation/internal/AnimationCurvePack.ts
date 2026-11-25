import { Color, Quaternion, Vector4 } from "@galacean/engine-math";
import { TypedArray } from "../../base/Constant";
import { Keyframe } from "../Keyframe";

/**
 * Evaluate a single scalar component of a cubic Hermite spline with precomputed basis terms.
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

/**
 * Cold-path read for 4-component numeric curves (`Vector4`, `Color`, `Quaternion`).
 */
export function readVec4Key<V extends Vector4 | Color | Quaternion>(
  values: TypedArray,
  hasTangents: boolean,
  index: number,
  out: { value: V; inTangent?: Vector4; outTangent?: Vector4 },
  dstValue: V
): void {
  out.value = dstValue;
  if (hasTangents) {
    const base = index * 12;
    (out.inTangent ||= new Vector4()).set(values[base], values[base + 1], values[base + 2], values[base + 3]);
    dstValue.set(values[base + 4], values[base + 5], values[base + 6], values[base + 7]);
    (out.outTangent ||= new Vector4()).set(values[base + 8], values[base + 9], values[base + 10], values[base + 11]);
  } else {
    const base = index * 4;
    dstValue.set(values[base], values[base + 1], values[base + 2], values[base + 3]);
    out.inTangent = undefined;
    out.outTangent = undefined;
  }
}

/**
 * Cold-path write for 4-component numeric curves (`Vector4`, `Color`, `Quaternion`).
 */
export function writeVec4Key(
  values: TypedArray,
  hasTangents: boolean,
  index: number,
  v0: number,
  v1: number,
  v2: number,
  v3: number,
  inTangent?: Vector4,
  outTangent?: Vector4
): void {
  if (hasTangents) {
    const base = index * 12;
    values[base] = inTangent ? inTangent.x : NaN;
    values[base + 1] = inTangent ? inTangent.y : NaN;
    values[base + 2] = inTangent ? inTangent.z : NaN;
    values[base + 3] = inTangent ? inTangent.w : NaN;
    values[base + 4] = v0;
    values[base + 5] = v1;
    values[base + 6] = v2;
    values[base + 7] = v3;
    values[base + 8] = outTangent ? outTangent.x : NaN;
    values[base + 9] = outTangent ? outTangent.y : NaN;
    values[base + 10] = outTangent ? outTangent.z : NaN;
    values[base + 11] = outTangent ? outTangent.w : NaN;
  } else {
    const base = index * 4;
    values[base] = v0;
    values[base + 1] = v1;
    values[base + 2] = v2;
    values[base + 3] = v3;
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
 * Subtract keyframe 0's components from `out` in place for variable-width numeric curves.
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

/**
 * Cold-path write for variable-width numeric curves (`Float32Array` and `number[]`).
 */
export function writeArrayKey(
  values: TypedArray,
  valueSize: number,
  hasTangents: boolean,
  index: number,
  key: Keyframe<Float32Array | number[]>
): void {
  const { value } = key;
  if (hasTangents) {
    const base = index * valueSize * 3;
    const valueOffset = base + valueSize;
    const outOffset = valueOffset + valueSize;
    const { inTangent, outTangent } = key;
    for (let i = 0; i < valueSize; i++) {
      values[base + i] = inTangent ? inTangent[i] : NaN;
      values[valueOffset + i] = value[i];
      values[outOffset + i] = outTangent ? outTangent[i] : NaN;
    }
  } else {
    const base = index * valueSize;
    for (let i = 0; i < valueSize; i++) {
      values[base + i] = value[i];
    }
  }
}
