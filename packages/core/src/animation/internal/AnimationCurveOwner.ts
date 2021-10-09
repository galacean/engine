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
  readonly originValue: InterpolableValue;
  readonly defaultValue: InterpolableValue;
  readonly fixedPoseValue: InterpolableValue;
  readonly hasSavedOriginValue: boolean = false;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    this.target = target;
    this.type = type;
    this.property = property;
    switch (property) {
      case AnimationProperty.Position:
        this.originValue = new Vector3();
        this.defaultValue = new Vector3();
        this.fixedPoseValue = new Vector3();
        this.component = target.transform;
        break;
      case AnimationProperty.Rotation:
        this.originValue = new Quaternion();
        this.defaultValue = new Quaternion();
        this.fixedPoseValue = new Quaternion();
        this.component = target.transform;
        break;
      case AnimationProperty.Scale:
        this.originValue = new Vector3();
        this.defaultValue = new Vector3();
        this.fixedPoseValue = new Vector3();
        this.component = target.transform;
        break;
      case AnimationProperty.BlendShapeWeights:
        this.originValue = new Float32Array(4);
        this.defaultValue = new Float32Array(4);
        this.fixedPoseValue = new Float32Array(4);
        this.component = target.getComponent(SkinnedMeshRenderer);
        break;
    }
  }

  saveOriginValue(): void {
    switch (this.property) {
      case AnimationProperty.Position:
        this.target.transform.position.cloneTo(<Vector3>this.originValue);
        break;
      case AnimationProperty.Rotation:
        this.target.transform.rotationQuaternion.cloneTo(<Quaternion>this.originValue);
        break;
      case AnimationProperty.Scale:
        this.target.transform.scale.cloneTo(<Vector3>this.originValue);
        break;
      case AnimationProperty.BlendShapeWeights:
        const { blendShapeWeights } = <SkinnedMeshRenderer>this.component;
        for (let i = 0, length = blendShapeWeights.length; i < length; ++i) {
          this.originValue[i] = (<SkinnedMeshRenderer>this.component).blendShapeWeights[i];
        }
        break;
    }
    this.hasSavedOriginValue = true;
  }

  saveDefaultValue(): void {
    if (!this.hasSavedOriginValue) {
      this.saveOriginValue();
    }
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
      case AnimationProperty.BlendShapeWeights:
        const { blendShapeWeights } = <SkinnedMeshRenderer>this.component;
        for (let i = 0, length = blendShapeWeights.length; i < length; ++i) {
          this.defaultValue[i] = (<SkinnedMeshRenderer>this.component).blendShapeWeights[i];
        }
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
      case AnimationProperty.BlendShapeWeights:
        const { blendShapeWeights } = <SkinnedMeshRenderer>this.component;
        for (let i = 0, length = blendShapeWeights.length; i < length; ++i) {
          this.fixedPoseValue[i] = (<SkinnedMeshRenderer>this.component).blendShapeWeights[i];
        }
        break;
    }
  }
}
