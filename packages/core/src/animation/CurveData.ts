import { Component } from "../Component";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationCureOwner } from "./AnimationCureOwner";

/**
 * @internal
 */
export class CurveData<T extends Component> {
  owner: AnimationCureOwner;
  clipCurveData: AnimationClipCurveData<T>;
}
