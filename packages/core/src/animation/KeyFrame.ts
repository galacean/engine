import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";

export type InterpolableValue = number | Vector2 | Vector3 | Vector4 | Quaternion | Float32Array;

/**
 * A single keyframe that can be injected into an animation curve.
 */
export class Keyframe {
  /** The time of the keyframe. */
  time: number;
}

export class ObjectKeyframe extends Keyframe {
  /** The object of the keyframe. */
  value: Object;
}

export class FloatKeyframe extends Keyframe {
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: number;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: number;
  /** The value of the curve at keyframe. */
  value: number;
}

export class FloatArrayKeyframe extends Keyframe {
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: Float32Array;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: Float32Array;
  /** The value of the curve at keyframe. */
  value: Float32Array;
}

export class Vector2Keyframe extends Keyframe {
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: Vector2;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: Vector2;
  /** The value of the curve at keyframe. */
  value: Vector2;
}
export class Vector3Keyframe extends Keyframe {
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: Vector3;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: Vector3;
  /** The value of the curve at keyframe. */
  value: Vector3;
}

export class Vector4Keyframe extends Keyframe {
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: Vector4;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: Vector4;
  /** The value of the curve at keyframe. */
  value: Vector4;
}

export class QuaternionKeyframe extends Keyframe {
  /** Sets the incoming tangent for this key. The incoming tangent affects the slope of the curve from the previous key to this key. */
  inTangent?: Vector4;
  /** Sets the outgoing tangent for this key. The outgoing tangent affects the slope of the curve from this key to the next key. */
  outTangent?: Vector4;
  /** The value of the curve at keyframe. */
  value: Quaternion;
}
