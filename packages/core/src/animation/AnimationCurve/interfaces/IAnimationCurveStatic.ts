import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurveOwner } from "../../internal/AnimationCurveOwner/AnimationCurveOwner";
import { KeyframeTangentType, KeyframeValueType } from "../../KeyFrame";

/**
 * @internal
 */
export interface IAnimationCurveStatic<T extends KeyframeTangentType, V extends KeyframeValueType> {
  _ownerType: AnimationCurveOwnertType;

  _initializeOwner(owner: AnimationCurveOwner<T, V>);
}

export type AnimationCurveOwnertType = new (
  target: Entity,
  type: new (entity: Entity) => Component,
  property: string
) => AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>;
