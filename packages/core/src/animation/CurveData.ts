import { Entity } from "../Entity";
import { Component } from "../Component";
import { InterpolableValue } from "./KeyFrame";
import { AnimationClipCurveData } from "./AnimationClipCurveData";

/**
 * @internal
 */
export class CurveData<T extends Component> {
  target: Entity;
  curveData: AnimationClipCurveData<T>;
  defaultValue: InterpolableValue;
  fiexedPoseValue: InterpolableValue;
}
