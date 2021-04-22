import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";

export type InterpolableValue = number | Vector2 | Vector3 | Vector4 | Quaternion;

/**
 * A single keyframe that can be injected into an animation curve.
 */
export interface Keyframe {
  /**
   * Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key.
   */
  inTangent?: number | Vector2 | Vector3 | Vector4;
  /**
   * Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key.
   */
  outTangent?: number | Vector2 | Vector3 | Vector4;
  /**
   * The time of the keyframe.
   */
  time: number;
  /**
   * The value of the curve at keyframe.
   */
  value: number | Vector2 | Vector3 | Vector4 | Quaternion;
}

export class FloatKeyframe implements Keyframe {
  /**
   * Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key.
   */
  inTangent?: number;
  /**
   * Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key.
   */
  outTangent?: number;
  /**
   * The time of the keyframe.
   */
  time: number;
  /**
   * The value of the curve at keyframe.
   */
  value: number;
}
export class Vector2Keyframe implements Keyframe {
  /**
   * Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key.
   */
  inTangent?: Vector2;
  /**
   * Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key.
   */
  outTangent?: Vector2;
  /**
   * The time of the keyframe.
   */
  time: number;
  /**
   * The value of the curve at keyframe.
   */
  value: Vector2;
}
export class Vector3Keyframe implements Keyframe {
  /**
   * Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key.
   */
  inTangent?: Vector3;
  /**
   * Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key.
   */
  outTangent?: Vector3;
  /**
   * The time of the keyframe.
   */
  time: number;
  /**
   * The value of the curve at keyframe.
   */
  value: Vector3;
}

export class Vector4Keyframe implements Keyframe {
  /**
   * Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key.
   */
  inTangent?: Vector4;
  /**
   * Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key.
   */
  outTangent?: Vector4;
  /**
   * The time of the keyframe.
   */
  time: number;
  /**
   * The value of the curve at keyframe.
   */
  value: Vector4;
}

export class QuaternionKeyframe implements Keyframe {
  /**
   * Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key.
   */
  inTangent?: Vector4;
  /**
   * Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key.
   */
  outTangent?: Vector4;
  /**
   * The time of the keyframe.
   */
  time: number;
  /**
   * The value of the curve at keyframe.
   */
  value: Quaternion;
}
