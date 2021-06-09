import { Component } from "../Component";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationCureOwner } from "./AnimationCureOwner";

/**
 * @internal
 */
export class CurveData<T extends Component> {
  owner: AnimationCureOwner;
  curveData: AnimationClipCurveData<T>;
  // target: Entity;
  // defaultValue: InterpolableValue;
  // fiexedPoseValue: InterpolableValue;
}
