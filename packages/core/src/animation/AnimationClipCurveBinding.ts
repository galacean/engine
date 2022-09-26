import { Component } from "../Component";
import { Entity } from "../Entity";
import { AnimationCurve } from "./AnimationCurve/AnimationCurve";
import { AnimationPropertyInternal } from "./enums/AnimationProperty";
import { InterpolableValueType } from "./enums/InterpolableValueType";
import { AnimationArrayCurveOwner } from "./internal/AnimationCurveOwner/AnimationArrayCurveOwner";
import { AnimationColorCurveOwner } from "./internal/AnimationCurveOwner/AnimationColorCurveOwner";
import { AnimationCurveOwner } from "./internal/AnimationCurveOwner/AnimationCurveOwner";
import { AnimationFloatArrayCurveOwner } from "./internal/AnimationCurveOwner/AnimationFloatArrayCurveOwner";
import { AnimationFloatCurveOwner } from "./internal/AnimationCurveOwner/AnimationFloatCurveOwner";
import { AnimationQuatCurveOwner } from "./internal/AnimationCurveOwner/AnimationQuatCurveOwner";
import { AnimationVector2CurveOwner } from "./internal/AnimationCurveOwner/AnimationVector2CurveOwner";
import { AnimationVector3CurveOwner } from "./internal/AnimationCurveOwner/AnimationVector3CurveOwner";
import { AnimationVector4CurveOwner } from "./internal/AnimationCurveOwner/AnimationVector4CurveOwner";

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
  property: AnimationPropertyInternal | string;
  /** The animation curve. */
  curve: AnimationCurve;

  private _defaultCurveOwner: AnimationCurveOwner;

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

  /**
   * @internal
   */
  _getDefaultCurveOwner(entity: Entity): AnimationCurveOwner {
    if (this._defaultCurveOwner) {
      return this._defaultCurveOwner;
    } else {
      return this._createCurveOwner(entity);
    }
  }
}
