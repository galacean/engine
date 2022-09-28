import { Color, Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";

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
export class InterpolableKeyframe<T extends KeyFrameTangentType, V extends KeyFrameValueType> extends Keyframe<V> {
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: T;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: T;
}

/**
 * Type of Keyframe tangent.
 */
export type KeyFrameTangentType = number | Vector2 | Vector3 | Vector4 | number[] | Float32Array;

/**
 * Type of Keyframe value.
 */
export type KeyFrameValueType = number | Vector2 | Vector3 | Vector4 | number[] | Float32Array | Quaternion | Color;
