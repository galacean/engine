import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationProperty } from "./enums/AnimationProperty";
import { InterpolableValue } from "./KeyFrame";

/**
 * @internal
 */
export class AnimationCureOwner {
  animationClopCurveData: AnimationClipCurveData<Component>;
  target: Entity;
  defaultValue: InterpolableValue;
  fiexedPoseValue: InterpolableValue;
  crossCurveMark: number = 0;
  crossCurveIndex: number;

  saveFixedPoseValue(): void {
    switch (this.animationClopCurveData.property) {
      case AnimationProperty.Position:
        this.target.transform.position.cloneTo(<Vector3>this.fiexedPoseValue);
        break;
      case AnimationProperty.Rotation:
        this.target.transform.rotationQuaternion.cloneTo(<Quaternion>this.fiexedPoseValue);
        break;
      case AnimationProperty.Scale:
        this.target.transform.scale.cloneTo(<Vector3>this.fiexedPoseValue);
        break;
    }
  }
}
