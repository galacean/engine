import { Component } from "../Component";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationCureOwner } from "./AnimationCureOwner";

/**
 * @internal
 */
export class CurveData<T extends Component> {
  owner: AnimationCureOwner<Component>;
  clipCurveData: AnimationClipCurveData<T>; //CM: 好像没用
}
