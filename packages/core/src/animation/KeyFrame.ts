import { Vector2, Vector3, Vector4, Quaternion, Color } from "@oasis-engine/math";

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

export class FloatKeyframe extends InterpolableKeyframe<number, number> {}
export class ArrayKeyframe extends InterpolableKeyframe<Array<number>, Array<number>> {}
export class FloatArrayKeyframe extends InterpolableKeyframe<Float32Array, Float32Array> {}
export class Vector2Keyframe extends InterpolableKeyframe<Vector2, Vector2> {}
export class Vector3Keyframe extends InterpolableKeyframe<Vector3, Vector3> {}
export class Vector4Keyframe extends InterpolableKeyframe<Vector4, Vector4> {}
export class QuaternionKeyframe extends InterpolableKeyframe<Vector4, Quaternion> {}
export class ColorKeyframe extends InterpolableKeyframe<Vector4, Color> {}

export type UnionInterpolableKeyframe =
  | FloatKeyframe
  | ArrayKeyframe
  | FloatArrayKeyframe
  | Vector2Keyframe
  | Vector3Keyframe
  | Vector4Keyframe
  | QuaternionKeyframe
  | ColorKeyframe;

export type InterpolableValue =
  | number
  | Vector2
  | Vector3
  | Vector4
  | Quaternion
  | Color
  | Float32Array
  | Array<number>;
