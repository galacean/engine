import { Quaternion } from "@oasis-engine/math";
import { Vector4 } from "@oasis-engine/math/src";
import { Component } from "../../../Component";
import { AnimationProperty, AnimationPropertyInternal } from "../../enums/AnimationProperty";
import { Entity } from "./../../../Entity";
import { AnimatorUtils } from "./../../AnimatorUtils";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class AnimationQuaternionCurveOwner extends AnimationCurveOwner<Vector4, Quaternion> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);

    this._defaultValue = new Quaternion();
    this._fixedPoseValue = new Quaternion();
    this._baseTempValue = new Quaternion();
    this._crossTempValue = new Quaternion();

    switch (property) {
      case AnimationPropertyInternal.Rotation:
        this._targetValue = target.transform.rotationQuaternion;
        break;
      default:
        this._propertyReference = this._getPropertyReference();
        const { mounted, propertyName } = this._propertyReference;
        this._targetValue = mounted[propertyName];
        break;
    }
  }

  saveDefaultValue() {
    this._defaultValue.copyFrom(this._targetValue);
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue() {
    this._fixedPoseValue.copyFrom(this._targetValue);
  }

  revertDefaultValue() {
    if (!this._hasSavedDefaultValue) return;

    const { target, property } = this;
    switch (property) {
      case AnimationPropertyInternal.Rotation:
        target.transform.rotationQuaternion = this._defaultValue;
        break;
      default:
        const { mounted, propertyName } = this._propertyReference;
        mounted[propertyName] = this._defaultValue;
    }
  }

  protected _applyValue(value: Quaternion, weight: number) {
    const { target, property } = this;
    switch (property) {
      case AnimationPropertyInternal.Rotation: {
        const { transform } = target;
        if (weight === 1.0) {
          transform.rotationQuaternion = value;
        } else {
          const rotationQuaternion = transform.rotationQuaternion;
          Quaternion.slerp(rotationQuaternion, value, weight, rotationQuaternion);
        }
        break;
      }
      default:
        const { mounted, propertyName } = this._propertyReference;
        if (weight === 1.0) {
          mounted[propertyName] = value;
        } else {
          const originValue = mounted[propertyName];
          Quaternion.slerp(originValue, value, weight, originValue);
        }
        break;
    }
  }

  protected _applyAdditiveValue(value: Quaternion, weight: number) {
    const { target, property } = this;
    switch (property) {
      case AnimationPropertyInternal.Rotation: {
        const { transform } = target;
        const rotationQuaternion = transform.rotationQuaternion;
        AnimatorUtils.quaternionWeight(value, weight, value);
        value.normalize();
        rotationQuaternion.multiply(value);
        transform.rotationQuaternion = rotationQuaternion;
        break;
      }
      default:
        const { mounted, propertyName } = this._propertyReference;
        const originValue = mounted[propertyName];
        AnimatorUtils.quaternionWeight(value, weight, value);
        value.normalize();
        originValue.multiply(value);
        mounted[propertyName] = originValue;
        break;
    }
  }

  protected _lerpValue(srcValue: Quaternion, destValue: Quaternion, crossWeight: number, out: Quaternion): Quaternion {
    Quaternion.slerp(srcValue, destValue, crossWeight, out);
    return out;
  }
}
