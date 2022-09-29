import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurveOwner } from "../../internal/AnimationCurveOwner/AnimationCurveOwner";
import { KeyframeValueType } from "../../KeyFrame";

/**
 * @internal
 */
export interface IAnimationCurveCalculator<V extends KeyframeValueType> {
  _ownerType: AnimationCurveOwnertType;

  _initializeOwner(owner: AnimationCurveOwner<V>);
}

export type AnimationCurveOwnertType = new (
  target: Entity,
  type: new (entity: Entity) => Component,
  property: string
) => AnimationCurveOwner<KeyframeValueType>;
