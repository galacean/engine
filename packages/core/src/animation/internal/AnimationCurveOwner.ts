import { AnimationClipCurveBinding } from "../AnimationClipCurveBinding";
import { InterpolableValueType } from "../enums/InterpolableValueType";
import { Vector2, Vector3, Vector4, Quaternion, Color } from "@oasis-engine/math";
import { Component } from "../../Component";
import { Entity } from "../../Entity";
import { SkinnedMeshRenderer } from "../../mesh/SkinnedMeshRenderer";
import { AnimationProperty } from "../enums/AnimationProperty";
import { InterpolableValue } from "../KeyFrame";

/**
 * @internal
 */
export interface PropertyReference {
  mounted: Component | { [key: string]: number };
  propertyName: string;
}

/**
 * @internal
 */
export class AnimationCurveOwner {
  crossCurveMark: number = 0;
  crossCurveIndex: number;
  defaultValue: InterpolableValue;
  fixedPoseValue: InterpolableValue;

  readonly target: Entity;
  readonly curveBinding: AnimationClipCurveBinding;
  readonly component: Component;
  readonly propertyReference: PropertyReference;

  /** @internal */
  _hasSavedDefaultValue: boolean = false;

  constructor(target: Entity, curveBinding: AnimationClipCurveBinding) {
    this.target = target;
    this.curveBinding = curveBinding;

    switch (curveBinding.property) {
      case AnimationProperty.Position:
      case AnimationProperty.Rotation:
      case AnimationProperty.Scale:
        this.component = target.transform;
        break;
      case AnimationProperty.BlendShapeWeights:
        this.component = target.getComponent(SkinnedMeshRenderer);
        break;
      default:
        this.component = target.getComponent(curveBinding.type);
        const properties = curveBinding.property.split(".");
        let mounted = this.component;
        for (let i = 0, n = properties.length; i < n - 1; ++i) {
          mounted = mounted[properties[i]];
        }
        this.propertyReference = {
          mounted,
          propertyName: properties[properties.length - 1]
        };
        break;
    }

    switch (curveBinding.curve._valueType) {
      case InterpolableValueType.Vector2:
        this.defaultValue = new Vector3();
        this.fixedPoseValue = new Vector3();
        break;
      case InterpolableValueType.Vector3:
        this.defaultValue = new Vector3();
        this.fixedPoseValue = new Vector3();
        break;
      case InterpolableValueType.Vector4:
        this.defaultValue = new Vector3();
        this.fixedPoseValue = new Vector3();
        break;
      case InterpolableValueType.Quaternion:
        this.defaultValue = new Quaternion();
        this.fixedPoseValue = new Quaternion();
        break;
      case InterpolableValueType.Quaternion:
        this.defaultValue = new Quaternion();
        this.fixedPoseValue = new Quaternion();
        break;
      case InterpolableValueType.Color:
        this.defaultValue = new Color();
        this.fixedPoseValue = new Color();
        break;
    }
  }

  saveDefaultValue(): void {
    const { curveBinding } = this;
    switch (curveBinding.property) {
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
      default:
        const { propertyReference } = this;
        const propertyValue = propertyReference.mounted[propertyReference.propertyName];
        switch (curveBinding.curve._valueType) {
          case InterpolableValueType.Float:
            this.defaultValue = propertyValue;
            break;
          case InterpolableValueType.FloatArray:
            const arr = propertyValue as Float32Array;
            for (let i = 0, length = arr.length; i < length; ++i) {
              this.defaultValue[i] = arr[i];
            }
            break;
          case InterpolableValueType.Vector2:
            (<Vector2>propertyValue).cloneTo(<Vector2>this.defaultValue);
            break;
          case InterpolableValueType.Vector3:
            (<Vector3>propertyValue).cloneTo(<Vector3>this.defaultValue);
            break;
          case InterpolableValueType.Vector4:
            (<Vector4>propertyValue).cloneTo(<Vector4>this.defaultValue);
            break;
          case InterpolableValueType.Quaternion:
            (<Quaternion>propertyValue).cloneTo(<Quaternion>this.defaultValue);
            break;
          case InterpolableValueType.Color:
            (<Color>propertyValue).cloneTo(<Color>this.defaultValue);
            break;
        }
        break;
    }
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    const { curveBinding } = this;
    switch (curveBinding.property) {
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
      default:
        const { propertyReference } = this;
        const propertyValue = propertyReference.mounted[propertyReference.propertyName];
        switch (curveBinding.curve._valueType) {
          case InterpolableValueType.Float:
            this.fixedPoseValue = propertyValue;
            break;
          case InterpolableValueType.FloatArray:
            const arr = propertyValue as Float32Array;
            for (let i = 0, length = arr.length; i < length; ++i) {
              this.fixedPoseValue[i] = arr[i];
            }
            break;
          case InterpolableValueType.Vector2:
            (<Vector2>propertyValue).cloneTo(<Vector2>this.fixedPoseValue);
            break;
          case InterpolableValueType.Vector3:
            (<Vector3>propertyValue).cloneTo(<Vector3>this.fixedPoseValue);
            break;
          case InterpolableValueType.Vector4:
            (<Vector4>propertyValue).cloneTo(<Vector4>this.fixedPoseValue);
            break;
          case InterpolableValueType.Quaternion:
            (<Quaternion>propertyValue).cloneTo(<Quaternion>this.fixedPoseValue);
            break;
          case InterpolableValueType.Color:
            (<Color>propertyValue).cloneTo(<Color>this.fixedPoseValue);
            break;
        }
        break;
    }
  }
}
