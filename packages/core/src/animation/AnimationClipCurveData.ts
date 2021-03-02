import { InterpolableValue } from "./KeyFrame";
import { Entity } from "./../Entity";
import { Component } from "../Component";
import { AnimationCurve } from "./AnimationCurve";

export interface AnimationClipCurveData<T extends Component> {
  curve: AnimationCurve;
  relativePath: string;
  type: new (entity: Entity) => T;
  propertyName: string;
  /** @internal */
  _target?: Entity;
  _defaultValue?: InterpolableValue;
}
