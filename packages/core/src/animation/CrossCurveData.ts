import { Component } from "../Component";
import { AnimationCureOwner } from "./AnimationCureOwner";
/**
 * @internal
 */
export class CrossCurveData {
  owner: AnimationCureOwner<Component>;
  curCurveIndex: number;
  nextCurveIndex: number;
}
