import { Component } from "../Component";
import { Entity } from "../Entity";
import { KeyframeValueType } from "./Keyframe";
import { AnimationCurve } from "./animationCurve";
import { IAnimationCurveCalculator } from "./animationCurve/interfaces/IAnimationCurveCalculator";
import { AnimationCurveLayerOwner } from "./internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "./internal/animationCurveOwner/AnimationCurveOwner";

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
  /** The index of the component that is animated. */
  typeIndex: number = 0;
  /**
   * The name or path to the property being animated.
   * @remarks support property:"a.b", array: "a.b[0]", method: "a.b('c', 0, $value)"
   */
  property: string;

  /**
   * The name or path to get the value when being animated.
   * @remarks support property:"a.b", array: "a.b[0]", method: "a.b('c', 0)"
   */
  getProperty?: string;
  /** The animation curve. */
  curve: AnimationCurve<KeyframeValueType>;

  private _tempCurveOwner: Record<number, AnimationCurveOwner<KeyframeValueType>> = {};

  /**
   * @internal
   */
  _createCurveOwner(entity: Entity, component: Component): AnimationCurveOwner<KeyframeValueType> {
    const curveType = (<unknown>this.curve.constructor) as IAnimationCurveCalculator<KeyframeValueType>;
    const owner = new AnimationCurveOwner(entity, this.type, component, this.property, this.getProperty, curveType);
    curveType._initializeOwner(owner);
    owner.saveDefaultValue();
    return owner;
  }

  /**
   * @internal
   */
  _createCurveLayerOwner(owner: AnimationCurveOwner<KeyframeValueType>): AnimationCurveLayerOwner {
    const curveType = (<unknown>this.curve.constructor) as IAnimationCurveCalculator<KeyframeValueType>;
    const layerOwner = new AnimationCurveLayerOwner();
    layerOwner.curveOwner = owner;
    curveType._initializeLayerOwner(layerOwner);
    // If curve.keys.length is 0, updateFinishedState will assign 0 to the target, causing an error, so initialize by assigning defaultValue to finalValue.
    layerOwner.initFinalValue();
    return layerOwner;
  }

  /**
   * @internal
   */
  _getTempCurveOwner(entity: Entity, component: Component): AnimationCurveOwner<KeyframeValueType> {
    const { instanceId } = entity;
    if (!this._tempCurveOwner[instanceId]) {
      this._tempCurveOwner[instanceId] = this._createCurveOwner(entity, component);
    }
    return this._tempCurveOwner[instanceId];
  }
}
