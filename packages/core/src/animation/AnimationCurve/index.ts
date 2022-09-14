import { InterpolableValueType } from "../enums/InterpolableValueType";
import { AnimationCurve } from "./AnimationCurve";
import { AnimationArrayCurve } from "./AnimationArrayCurve";
import { AnimationColorCurve } from "./AnimationColorCurve";
import { AnimationFloatArrayCurve } from "./AnimationFloatArrayCurve";
import { AnimationFloatCurve } from "./AnimationFloatCurve";
import { AnimationQuatCurve } from "./AnimationQuatCurve";
import { AnimationVector2Curve } from "./AnimationVector2Curve";
import { AnimationVector3Curve } from "./AnimationVector3Curve";
import { AnimationVector4Curve } from "./AnimationVector4Curve";
export { AnimationArrayCurve } from "./AnimationArrayCurve";
export { AnimationColorCurve } from "./AnimationColorCurve";
export { AnimationCurve } from "./AnimationCurve";
export { AnimationFloatArrayCurve } from "./AnimationFloatArrayCurve";
export { AnimationFloatCurve } from "./AnimationFloatCurve";
export { AnimationQuatCurve } from "./AnimationQuatCurve";
export { AnimationVector2Curve } from "./AnimationVector2Curve";
export { AnimationVector3Curve } from "./AnimationVector3Curve";
export { AnimationVector4Curve } from "./AnimationVector4Curve";

export class AnimationCurveFactory {
  static create(type: InterpolableValueType.Float): AnimationFloatCurve;
  static create(type: InterpolableValueType.Vector2): AnimationVector2Curve;
  static create(type: InterpolableValueType.Vector3): AnimationVector3Curve;
  static create(type: InterpolableValueType.Vector4): AnimationVector4Curve;
  static create(type: InterpolableValueType.Quaternion): AnimationQuatCurve;
  static create(type: InterpolableValueType.Color): AnimationColorCurve;
  static create(type: InterpolableValueType.FloatArray): AnimationFloatArrayCurve;
  static create(type: InterpolableValueType.Array): AnimationArrayCurve;
  static create(type: InterpolableValueType): AnimationCurve;

  static create(type: InterpolableValueType): AnimationCurve {
    switch (type) {
      case InterpolableValueType.Float:
        return new AnimationFloatCurve();
      case InterpolableValueType.Vector2:
        return new AnimationVector2Curve();
      case InterpolableValueType.Vector3:
        return new AnimationVector3Curve();
      case InterpolableValueType.Vector4:
        return new AnimationVector4Curve();
      case InterpolableValueType.Quaternion:
        return new AnimationQuatCurve();
      case InterpolableValueType.Color:
        return new AnimationColorCurve();
      case InterpolableValueType.FloatArray:
        return new AnimationFloatArrayCurve();
      case InterpolableValueType.Array:
        return new AnimationArrayCurve();
    }
  }
}
