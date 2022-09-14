import { Component } from "../Component";
import { Entity } from "../Entity";
import { AnimationCurve } from "./AnimationCurve";
import { AnimationPropertyInternal } from "./enums/AnimationProperty";
import { InterpolableValueType } from "./enums/InterpolableValueType";
import {
  AnimationCurveOwner,
  AnimationFloatCurveOwner,
  AnimationVector2CurveOwner,
  AnimationVector3CurveOwner,
  AnimationVector4CurveOwner,
  AnimationQuatCurveOwner,
  AnimationColorCurveOwner,
  AnimationFloatArrayCurveOwner,
  AnimationArrayCurveOwner
} from "./internal/AnimationCurveOwner";

/**
 * Associate AnimationCurve and the Entity
 */
export class AnimationClipCurveBinding {
  /** Path to the entity this curve applies to. The relativePath is formatted similar to a pathname,
   * e.g. "root/spine/leftArm". If relativePath is empty it refers to the entity the animation clip is attached to. */
  relativePath: string;
  /** The class type of the component that is animated. */
  type: new (entity: Entity) => Component;
  /** The name or path to the property being animated. */
  property: AnimationPropertyInternal | string;
  /** The animation curve. */
  curve: AnimationCurve;

  /**
   * @internal
   */
  _createCurveOwner(entity: Entity): AnimationCurveOwner {
    switch (this.curve._valueType) {
      case InterpolableValueType.Float:
        return new AnimationFloatCurveOwner(entity, this.type, this.property);
      case InterpolableValueType.Vector2:
        return new AnimationVector2CurveOwner(entity, this.type, this.property);
      case InterpolableValueType.Vector3:
        return new AnimationVector3CurveOwner(entity, this.type, this.property);
      case InterpolableValueType.Vector4:
        return new AnimationVector4CurveOwner(entity, this.type, this.property);
      case InterpolableValueType.Quaternion:
        return new AnimationQuatCurveOwner(entity, this.type, this.property);
      case InterpolableValueType.Color:
        return new AnimationColorCurveOwner(entity, this.type, this.property);
      case InterpolableValueType.FloatArray:
        return new AnimationFloatArrayCurveOwner(entity, this.type, this.property);
      case InterpolableValueType.Array:
        return new AnimationArrayCurveOwner(entity, this.type, this.property);
      default:
        console.error("The curve need add keyframe to play: ", this.curve);
    }
  }
}
