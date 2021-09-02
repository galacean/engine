import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";

/**
 * Keyframe.
 * @typeParam V - Type of Keyframe value
 */
export class Keyframe<V> {
  /** The time of the Keyframe. */
  time: number;
  /** The value of the Keyframe. */
  value: V;
}

/**
 * InterpolableKeyframe.
 * @typeParam T - Type of Tangent value
 * @typeParam V - Type of Keyframe value
 */
export class InterpolableKeyframe<T, V> extends Keyframe<V> {
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: T;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: T;
}

export type ObjectKeyframe = Keyframe<Object>;
export type FloatKeyframe = InterpolableKeyframe<number, number>;
export type FloatArrayKeyframe = InterpolableKeyframe<Float32Array, Float32Array>;
export type Vector2Keyframe = InterpolableKeyframe<Vector2, Vector2>;
export type Vector3Keyframe = InterpolableKeyframe<Vector3, Vector3>;
export type Vector4Keyframe = InterpolableKeyframe<Vector4, Vector4>;
export type QuaternionKeyframe = InterpolableKeyframe<Vector4, Quaternion>;

export type UnionInterpolableKeyframe =
  | FloatKeyframe
  | FloatArrayKeyframe
  | Vector2Keyframe
  | Vector3Keyframe
  | Vector4Keyframe
  | QuaternionKeyframe;

export type InterpolableValue = number | Vector2 | Vector3 | Vector4 | Quaternion | Float32Array | Object;
