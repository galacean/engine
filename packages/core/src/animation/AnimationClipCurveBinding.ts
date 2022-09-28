import { Component } from "../Component";
import { Entity } from "../Entity";
import { AnimationCurve, AnimationFloatCurve } from "./AnimationCurve";
import { IAnimationReferenceCurveOperation } from "./AnimationCurve/IAnimationReferenceCurveOperation";
import { IAnimationValueCurveOperation } from "./AnimationCurve/IAnimationValueCurveOperation";
import { AnimationCurveOwner } from "./internal/AnimationCurveOwner/AnimationCurveOwner";
import { AnimationCurveReferenceOwner } from "./internal/AnimationCurveOwner/AnimationCurveReferenceOwner";
import { AnimationCurveValueOwner } from "./internal/AnimationCurveOwner/AnimationCurveValueOwner";
import { KeyframeTangentType, KeyframeValueType } from "./KeyFrame";

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
  curve: AnimationCurve<KeyframeTangentType, KeyframeValueType>;

  private _defaultCurveOwner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>;

  /**
   * @internal
   */
  _createCurveOwner(entity: Entity): AnimationCurveOwner<KeyframeTangentType, KeyframeValueType> {
    if (this.curve instanceof AnimationFloatCurve) {
      const owner = new AnimationCurveValueOwner(entity, this.type, this.property);
      owner._cureType = (<unknown>this.curve.constructor) as IAnimationValueCurveOperation<number>;
      this.curve._initializeOwner(owner);
      return owner;
    } else {
      const owner = new AnimationCurveReferenceOwner(entity, this.type, this.property);
      owner._cureType = (<unknown>this.curve.constructor) as IAnimationReferenceCurveOperation<KeyframeTangentType>;
      this.curve._initializeOwner(owner);
      return owner;
    }
  }

  /**
   * @internalKeyframeTangentType
   */
  _getDefaultCurveOwner(entity: Entity): AnimationCurveOwner<KeyframeTangentType, KeyframeValueType> {
    if (this._defaultCurveOwner) {
      return this._defaultCurveOwner;
    } else {
      return this._createCurveOwner(entity);
    }
  }
}
