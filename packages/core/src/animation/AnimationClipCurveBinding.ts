import { Component } from "../Component";
import { Entity } from "../Entity";
import { AnimationCurve } from "./AnimationCurve";
import { IAnimationCurveCalculator } from "./AnimationCurve/interfaces/IAnimationCurveCalculator";
import { AnimationCurveOwner } from "./internal/AnimationCurveOwner/AnimationCurveOwner";
import { KeyframeValueType } from "./Keyframe";

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
  curve: AnimationCurve<KeyframeValueType>;

  private _defaultCurveOwner: AnimationCurveOwner<KeyframeValueType>;

  /**
   * @internal
   */
  _createCurveOwner(entity: Entity): AnimationCurveOwner<KeyframeValueType> {
    const animationCurveCalculator = (<unknown>this.curve.constructor) as IAnimationCurveCalculator<KeyframeValueType>;

    const owner = new AnimationCurveOwner(entity, this.type, this.property, animationCurveCalculator._isReferenceType);
    owner.cureType = animationCurveCalculator;
    animationCurveCalculator._initializeOwner(owner);
    return owner;
  }

  /**
   * @internal
   */
  _getDefaultCurveOwner(entity: Entity): AnimationCurveOwner<KeyframeValueType> {
    if (this._defaultCurveOwner) {
      return this._defaultCurveOwner;
    } else {
      return this._createCurveOwner(entity);
    }
  }
}
