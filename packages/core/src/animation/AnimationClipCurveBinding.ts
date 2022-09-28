import { Component } from "../Component";
import { Entity } from "../Entity";
import {
  AnimationArrayCurve,
  AnimationColorCurve,
  AnimationCurve,
  AnimationFloatArrayCurve,
  AnimationFloatCurve,
  AnimationQuaternionCurve,
  AnimationVector2Curve,
  AnimationVector3Curve,
  AnimationVector4Curve
} from "./AnimationCurve";
import { InterpolableValueType } from "./enums/InterpolableValueType";
import { AnimationCurveOwner } from "./internal/AnimationCurveOwner/AnimationCurveOwner";
import { KeyFrameTangentType, KeyFrameValueType } from "./KeyFrame";

/**
 * Associate AnimationCurve and the Entity
 */
export class AnimationClipCurveBinding {
  /**
   * Path to the entity this curve applies to. The relativePath is formatted similar to a pathname,
   * e.g. "root/spine/leftArm". If relativePath is empty it refers to the entity the animation clip is attached to.
   */
  relativePath: string;
  /** The class type of the component that is animated. */
  type: new (entity: Entity) => Component;
  /** The name or path to the property being animated. */
  property: string;
  /** The animation curve. */
  curve: AnimationCurve<KeyFrameTangentType, KeyFrameValueType>;

  private _defaultCurveOwner: AnimationCurveOwner<KeyFrameTangentType, KeyFrameValueType>;

  /**
   * @internal
   */
  _createCurveOwner(entity: Entity): AnimationCurveOwner<KeyFrameTangentType, KeyFrameValueType> {
    let owner = new AnimationCurveOwner(entity, this.type, this.property);
    switch (this.curve._type) {
      case InterpolableValueType.Float:
        owner._cureType = AnimationFloatCurve;
        break;
      case InterpolableValueType.Vector2:
        owner._cureType = AnimationVector2Curve;
        break;
      case InterpolableValueType.Vector3:
        owner._cureType = AnimationVector3Curve;
        break;
      case InterpolableValueType.Vector4:
        owner._cureType = AnimationVector4Curve;
        break;
      case InterpolableValueType.Quaternion:
        owner._cureType = AnimationQuaternionCurve;
        break;
      case InterpolableValueType.Color:
        owner._cureType = AnimationColorCurve;
        break;
      case InterpolableValueType.FloatArray:
        owner._cureType = AnimationFloatArrayCurve;
        break;
      case InterpolableValueType.Array:
        owner._cureType = AnimationArrayCurve;
        break;
      default:
        console.error("The curve need add keyframe to play: ", this.curve);
    }
    this.curve._initializeOwner(owner);
    return owner;
  }

  /**
   * @internal
   */
  _getDefaultCurveOwner(entity: Entity): AnimationCurveOwner<KeyFrameTangentType, KeyFrameValueType> {
    if (this._defaultCurveOwner) {
      return this._defaultCurveOwner;
    } else {
      return this._createCurveOwner(entity);
    }
  }
}
