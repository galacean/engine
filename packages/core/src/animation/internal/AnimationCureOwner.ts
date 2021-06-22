import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Component } from "../../Component";
import { Entity } from "../../Entity";
import { AnimationProperty } from "../enums/AnimationProperty";
import { InterpolableValue } from "../KeyFrame";

/**
 * @internal
 */
export class AnimationCureOwner<T extends Component> {
  crossCurveMark: number = 0;
  crossCurveIndex: number;

  readonly target: Entity;
  readonly type: new (entity: Entity) => T;
  readonly property: AnimationProperty;
  readonly defaultValue: InterpolableValue;
  readonly fixedPoseValue: InterpolableValue;

  constructor(target: Entity, type: new (entity: Entity) => T, property: AnimationProperty) {
    this.target = target;
    this.type = type;
    this.property = property;
    switch (property) {
      case AnimationProperty.Position:
        this.defaultValue = new Vector3();
        this.fixedPoseValue = new Vector3();
        break;
      case AnimationProperty.Rotation:
        this.defaultValue = new Quaternion();
        this.fixedPoseValue = new Quaternion();
        break;
      case AnimationProperty.Scale:
        this.defaultValue = new Vector3();
        this.fixedPoseValue = new Vector3();
        break;
    }
  }

  saveDefaultValue(): void {
    switch (this.property) {
      case AnimationProperty.Position:
        this.target.transform.position.cloneTo(<Vector3>this.defaultValue);
        break;
      case AnimationProperty.Rotation:
        this.target.transform.rotationQuaternion.cloneTo(<Quaternion>this.defaultValue);
        break;
      case AnimationProperty.Scale:
        this.target.transform.scale.cloneTo(<Vector3>this.defaultValue);
        break;
    }
  }

  saveFixedPoseValue(): void {
    switch (this.property) {
      case AnimationProperty.Position:
        this.target.transform.position.cloneTo(<Vector3>this.fixedPoseValue);
        break;
      case AnimationProperty.Rotation:
        this.target.transform.rotationQuaternion.cloneTo(<Quaternion>this.fixedPoseValue);
        break;
      case AnimationProperty.Scale:
        this.target.transform.scale.cloneTo(<Vector3>this.fixedPoseValue);
        break;
    }
  }
}
