import { Color } from "@oasis-engine/math";
import { AnimationCurveOwner, PropertyReference } from "./AnimationCurveOwner";
import { Component } from "../../../Component";
import { AnimationProperty } from "../../enums/AnimationProperty";
import { Entity } from "./../../../Entity";
/**
 * @internal
 */
export class AnimationColorCurveOwner extends AnimationCurveOwner {
  protected _defaultValue = new Color();
  protected _fixedPoseValue = new Color();
  protected _propertyReference: PropertyReference;
  protected _baseTempValue = new Color();
  protected _crossTempValue = new Color();

  private _targetValue: Color;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    this._propertyReference = this._getPropertyReference();
    const { mounted, propertyName } = this._propertyReference;
    this._targetValue = mounted[propertyName] as Color;
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

  protected _applyValue(value: Color, weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    if (weight === 1.0) {
      mounted[propertyName] = value;
    } else {
      const originValue = mounted[propertyName] as Color;
      Color.lerp(originValue, value, weight, originValue);
    }
  }

  protected _applyAdditiveVale(value: Color, weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    const originValue = mounted[propertyName] as Color;
    originValue.r += value.r * weight;
    originValue.g += value.g * weight;
    originValue.b += value.b * weight;
    originValue.a += value.a * weight;
    mounted[propertyName] = originValue;
  }

  protected _applyCrossValue(
    srcValue: Color,
    destValue: Color,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const value = this._baseTempValue;
    Color.lerp(srcValue, destValue, crossWeight, value);
    if (additive) {
      this._applyAdditiveVale(value, layerWeight);
    } else {
      this._applyValue(value, layerWeight);
    }
  }
}
