import { Component } from "../Component";
import { Entity } from "../Entity";
import { KeyframeValueType } from "./Keyframe";
import { AnimationCurve } from "./animationCurve";
import { IAnimationCurveCalculator } from "./animationCurve/interfaces/IAnimationCurveCalculator";
import { AnimationCurveLayerOwner } from "./internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "./internal/animationCurveOwner/AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationClipCurveBinding {
  relativePath: string;
  type: new (entity: Entity) => Component;
  typeIndex: number = 0;
  property: string;
  getProperty?: string;
  curve: AnimationCurve<KeyframeValueType>;

  private _tempCurveOwner: Record<number, AnimationCurveOwner<KeyframeValueType>> = {};

  _createCurveOwner(entity: Entity, component: Component): AnimationCurveOwner<KeyframeValueType> {
    const curveType = (<unknown>this.curve.constructor) as IAnimationCurveCalculator<KeyframeValueType>;
    const owner = new AnimationCurveOwner(entity, this.type, component, this.property, this.getProperty, curveType);
    curveType._initializeOwner(owner);
    owner.saveDefaultValue();
    return owner;
  }

  _createCurveLayerOwner(owner: AnimationCurveOwner<KeyframeValueType>): AnimationCurveLayerOwner {
    const curveType = (<unknown>this.curve.constructor) as IAnimationCurveCalculator<KeyframeValueType>;
    const layerOwner = new AnimationCurveLayerOwner();
    layerOwner.curveOwner = owner;
    curveType._initializeLayerOwner(layerOwner);
    // If curve.keys.length is 0, updateFinishedState will assign 0 to the target, causing an error, so initialize by assigning defaultValue to finalValue.
    layerOwner.initFinalValue();
    return layerOwner;
  }

  _getTempCurveOwner(entity: Entity, component: Component): AnimationCurveOwner<KeyframeValueType> {
    const { instanceId } = entity;
    if (!this._tempCurveOwner[instanceId]) {
      this._tempCurveOwner[instanceId] = this._createCurveOwner(entity, component);
    }
    return this._tempCurveOwner[instanceId];
  }
}
