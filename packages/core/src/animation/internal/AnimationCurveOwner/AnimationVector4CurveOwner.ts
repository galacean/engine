import { Vector4 } from "@oasis-engine/math";
import { AnimationCurveOwner, PropertyReference } from "./AnimationCurveOwner";
import { Component } from "../../../Component";
import { AnimationProperty } from "../../enums/AnimationProperty";
import { Entity } from "./../../../Entity";

/**
 * @internal
 */
export class AnimationVector4CurveOwner extends AnimationCurveOwner {
  protected _defaultValue: Vector4 = new Vector4();
  protected _fixedPoseValue: Vector4 = new Vector4();
  protected _propertyReference: PropertyReference;
  protected _baseTempValue = new Vector4();
  protected _crossTempValue = new Vector4();

  private _targetValue: Vector4;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    this._propertyReference = this._getPropertyReference();
    const { mounted, propertyName } = this._propertyReference;
    this._targetValue = mounted[propertyName] as Vector4;
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

    const { mounted, propertyName } = this._propertyReference;
    mounted[propertyName] = this._defaultValue;
  }

  protected _applyValue(value: Vector4, weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    if (weight === 1.0) {
      mounted[propertyName] = value;
    } else {
      const originValue = mounted[propertyName] as Vector4;
      Vector4.lerp(originValue, value, weight, originValue);
    }
  }

  protected _applyAdditiveVale(value: Vector4, weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    const originValue = mounted[propertyName] as Vector4;
    originValue.x += value.x * weight;
    originValue.y += value.y * weight;
    originValue.z += value.z * weight;
    originValue.w += value.w * weight;
    mounted[propertyName] = originValue;
  }

  protected _applyCrossValue(
    srcValue: Vector4,
    destValue: Vector4,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const value = this._baseTempValue;
    Vector4.lerp(srcValue, destValue, crossWeight, value);
    if (additive) {
      this._applyAdditiveVale(value, layerWeight);
    } else {
      this._applyValue(value, layerWeight);
    }
  }
}
