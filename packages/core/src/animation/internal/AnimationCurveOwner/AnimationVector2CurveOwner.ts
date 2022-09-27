import { Vector2 } from "@oasis-engine/math";
import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationProperty } from "../../enums/AnimationProperty";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class AnimationVector2CurveOwner extends AnimationCurveOwner<Vector2, Vector2> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    this._propertyReference = this._getPropertyReference();
    const { mounted, propertyName } = this._propertyReference;
    this._targetValue = mounted[propertyName];
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

  protected _applyValue(value: Vector2, weight: number): void {
    const { mounted, propertyName } = this._propertyReference;
    if (weight === 1.0) {
      mounted[propertyName] = value;
    } else {
      const originValue = mounted[propertyName];
      Vector2.lerp(originValue, value, weight, originValue);
    }
  }

  protected _applyAdditiveValue(value: Vector2, weight: number): void {
    const { mounted, propertyName } = this._propertyReference;
    const originValue = mounted[propertyName];
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
  ): void {
    const value = this._baseTempValue;
    Vector2.lerp(srcValue, destValue, crossWeight, value);
    if (additive) {
      this._applyAdditiveValue(value, layerWeight);
    } else {
      this._applyValue(value, layerWeight);
    }
  }
}
