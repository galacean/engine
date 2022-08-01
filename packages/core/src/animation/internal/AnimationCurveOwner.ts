import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Component } from "../../Component";
import { Entity } from "../../Entity";
import { SkinnedMeshRenderer } from "../../mesh/SkinnedMeshRenderer";
import { AnimationProperty } from "../enums/AnimationProperty";
import { InterpolableValue } from "../KeyFrame";

/**
 * @internal
 */
export class AnimationCurveOwner {
  crossCurveMark: number = 0;
  crossCurveIndex: number;

  readonly target: Entity;
  readonly type: new (entity: Entity) => Component;
  readonly property: AnimationProperty;
  readonly component: Component;
  readonly defaultValue: InterpolableValue;
  readonly fixedPoseValue: InterpolableValue;

  /** @internal */
  _hasSavedDefaultValue: boolean = false;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    this.target = target;
    this.type = type;
    this.property = property;
    switch (property) {
      case AnimationProperty.Position:
        this.defaultValue = new Vector3();
        this.fixedPoseValue = new Vector3();
        this.component = target.transform;
        break;
      case AnimationProperty.Rotation:
        this.defaultValue = new Quaternion();
        this.fixedPoseValue = new Quaternion();
        this.component = target.transform;
        break;
      case AnimationProperty.Scale:
        this.defaultValue = new Vector3();
        this.fixedPoseValue = new Vector3();
        this.component = target.transform;
        break;
      case AnimationProperty.BlendShapeWeights:
        this.component = target.getComponent(SkinnedMeshRenderer);
        const weightLength = (<SkinnedMeshRenderer>this.component).blendShapeWeights.length;
        this.defaultValue = new Float32Array(weightLength);
        this.fixedPoseValue = new Float32Array(weightLength);
        break;
    }
  }

  saveDefaultValue(): void {
    switch (this.property) {
      case AnimationProperty.Position:
        (<Vector3>this.defaultValue).copyFrom(this.target.transform.position);
        break;
      case AnimationProperty.Rotation:
        (<Quaternion>this.defaultValue).copyFrom(this.target.transform.rotationQuaternion);
        break;
      case AnimationProperty.Scale:
        (<Vector3>this.defaultValue).copyFrom(this.target.transform.scale);
        break;
      case AnimationProperty.BlendShapeWeights:
        const { blendShapeWeights } = <SkinnedMeshRenderer>this.component;
        for (let i = 0, length = blendShapeWeights.length; i < length; ++i) {
          this.defaultValue[i] = blendShapeWeights[i];
        }
        break;
    }
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    switch (this.property) {
      case AnimationProperty.Position:
        (<Vector3>this.fixedPoseValue).copyFrom(this.target.transform.position);
        break;
      case AnimationProperty.Rotation:
        (<Quaternion>this.fixedPoseValue).copyFrom(this.target.transform.rotationQuaternion);
        break;
      case AnimationProperty.Scale:
        (<Vector3>this.fixedPoseValue).copyFrom(this.target.transform.scale);
        break;
      case AnimationProperty.BlendShapeWeights:
        const { blendShapeWeights } = <SkinnedMeshRenderer>this.component;
        for (let i = 0, length = blendShapeWeights.length; i < length; ++i) {
          this.fixedPoseValue[i] = (<SkinnedMeshRenderer>this.component).blendShapeWeights[i];
        }
        break;
    }
  }
}
