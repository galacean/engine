import { Vector2 } from "@oasis-engine/math";
import { AnimationCurveOwner, PropertyReference } from "./AnimationCurveOwner";
import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationProperty } from "../../enums/AnimationProperty";
/**
 * @internal
 */
export class AnimationVector2CurveOwner extends AnimationCurveOwner {
  protected _defaultValue = new Vector2();
  protected _fixedPoseValue = new Vector2();
  protected _propertyReference: PropertyReference;
  protected _baseTempValue = new Vector2();
  protected _crossTempValue = new Vector2();

  private _targetValue: Vector2;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    this._propertyReference = this._getPropertyReference();
    const { mounted, propertyName } = this._propertyReference;
    this._targetValue = mounted[propertyName] as Vector2;
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

  protected _applyValue(value: Vector2, weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    if (weight === 1.0) {
      mounted[propertyName] = value;
    } else {
      const originValue = mounted[propertyName] as Vector2;
      Vector2.lerp(originValue, value, weight, originValue);
    }
  }

  protected _applyAdditiveVale(value: Vector2, weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    const originValue = mounted[propertyName] as Vector2;
    originValue.x += value.x * weight;
    originValue.y += value.y * weight;
    mounted[propertyName] = originValue;
  }

  protected _applyCrossValue(
    srcValue: Vector2,
    destValue: Vector2,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const value = this._baseTempValue;
    Vector2.lerp(srcValue, destValue, crossWeight, value);
    if (additive) {
      this._applyAdditiveVale(value, layerWeight);
    } else {
      this._applyValue(value, layerWeight);
    }
  }
}
