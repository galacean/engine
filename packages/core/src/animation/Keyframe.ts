import { Color, Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";

/**
 * Keyframe.
 * @typeParam V - Type of Keyframe value
 */
export class Keyframe<
  V extends KeyframeValueType,
  T = V extends number
    ? number
    : V extends Vector2
    ? Vector2
    : V extends Vector3
    ? Vector3
    : V extends Vector4 | Color | Quaternion
    ? Vector4
    : V extends number[] | Float32Array
    ? number[]
    : never
> {
  /** The time of the Keyframe. */
  time: number;
  /** The value of the Keyframe. */
  value: V;
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: T;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: T;
}

/**
 * Type of Keyframe value.
 */
export type KeyframeValueType =
  | number
  | Vector2
  | Vector3
  | Vector4
  | number[]
  | Float32Array
  | Quaternion
  | Color
  | boolean;
