import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";

/**
 * Keyframe.
 * @typeParam V - Type of Keframe value
 */
export class Keyframe<V> {
  /** The time of the Keyframe. */
  time: number;
  /** The valye of the Keyframe. */
  value: V;
}

/**
 * InterpolaKeyframe.
 * @typeParam T - Type of Tangent value
 * @typeParam V - Type of Keframe value
 */
export class InterpolaKeyframe<T, V> extends Keyframe<V> {
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: T;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: T;
}

export type ObjectKeyframe = Keyframe<Object>;
export type FloatKeyframe = InterpolaKeyframe<number, number>;
export type FloatArrayKeyframe = InterpolaKeyframe<Float32Array, Float32Array>;
export type Vector2Keyframe = InterpolaKeyframe<Vector2, Vector2>;
export type Vector3Keyframe = InterpolaKeyframe<Vector3, Vector3>;
export type Vector4Keyframe = InterpolaKeyframe<Vector4, Vector4>;
export type QuaternionKeyframe = InterpolaKeyframe<Vector4, Quaternion>;

export type UnionInterpolaKeyframe =
  | FloatKeyframe
  | FloatArrayKeyframe
  | Vector2Keyframe
  | Vector3Keyframe
  | Vector4Keyframe
  | QuaternionKeyframe;

export type InterpolableValue = number | Vector2 | Vector3 | Vector4 | Quaternion | Float32Array | Object;
