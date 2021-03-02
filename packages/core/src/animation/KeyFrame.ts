import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";
import { InterpolationType } from "./AnimatorConst";

export type InterpolableValue = number | Vector2 | Vector3 | Vector4 | Quaternion;
export interface Keyframe {
  inTangent?: number | Vector2 | Vector3 | Vector4;
  outTangent?: number | Vector2 | Vector3 | Vector4;
  time: number;
  value: number | Vector2 | Vector3 | Vector4 | Quaternion;
  interpolation: InterpolationType;
}

export class FloatKeyframe implements Keyframe {
  inTangent: number;
  outTangent: number;
  time: number;
  value: number;
  interpolation: InterpolationType;
}
export class Vector2Keyframe implements Keyframe {
  inTangent: Vector2;
  outTangent: Vector2;
  time: number;
  value: Vector2;
  interpolation: InterpolationType;
}
export class Vector3Keyframe implements Keyframe {
  inTangent: Vector3;
  outTangent: Vector3;
  time: number;
  value: Vector3;
  interpolation: InterpolationType;
}

export class Vector4Keyframe implements Keyframe {
  inTangent: Vector4;
  outTangent: Vector4;
  time: number;
  value: Vector4;
  interpolation: InterpolationType;
}

export class QuaternionKeyframe implements Keyframe {
  inTangent: Vector4;
  outTangent: Vector4;
  time: number;
  value: Quaternion;
  interpolation: InterpolationType;
}
