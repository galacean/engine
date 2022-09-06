import { Quaternion } from "@oasis-engine/math";
import { AnimationCurveOwner, PropertyReference } from "./AnimationCurveOwner";
import { Component } from "../../../Component";
import { AnimationProperty, AnimationPropertyInternal } from "../../enums/AnimationProperty";
import { Entity } from "./../../../Entity";
import { AnimatorUtils } from "./../../AnimatorUtils";
/**
 * @internal
 */
export class AnimationQuatCurveOwner extends AnimationCurveOwner {
  protected _defaultValue = new Quaternion();
  protected _fixedPoseValue = new Quaternion();
  protected _propertyReference: PropertyReference;
  protected _baseTempValue = new Quaternion();
  protected _crossTempValue = new Quaternion();

  private _targetValue: Quaternion;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    switch (property) {
      case AnimationPropertyInternal.Rotation:
        this._targetValue = target.transform.rotationQuaternion;
        break;
      default:
        this._propertyReference = this._getPropertyReference();
        const { mounted, propertyName } = this._propertyReference;
        this._targetValue = mounted[propertyName] as Quaternion;
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
          const originValue = mounted[propertyName] as Quaternion;
          Quaternion.slerp(originValue, value, weight, originValue);
        }
        break;
    }
  }

  protected _applyAdditiveVale(value: Quaternion, weight: number) {
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
        const originValue = mounted[propertyName] as Quaternion;
        AnimatorUtils.quaternionWeight(value, weight, value);
        value.normalize();
        originValue.multiply(value);
        mounted[propertyName] = originValue;
        break;
    }
  }

  protected _applyCrossValue(
    srcValue: Quaternion,
    destValue: Quaternion,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const value = this._baseTempValue;
    Quaternion.slerp(srcValue, destValue, crossWeight, value);
    if (additive) {
      this._applyAdditiveVale(value, layerWeight);
    } else {
      this._applyValue(value, layerWeight);
    }
  }
}
