import { Entity } from "../Entity";
import { InterpolableValue } from "./KeyFrame";

/**
 * @internal
 */
export class AnimationCureOwner {
  target: Entity;
  defaultValue: InterpolableValue;
  fiexedPoseValue: InterpolableValue;
  crossCurveMark: number = 0;
  crossCurveIndex: number;
}
