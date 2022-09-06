import { AnimationCurveOwner, PropertyReference } from "./AnimationCurveOwner";
import { Component } from "../../../Component";
import { AnimationProperty } from "../../enums/AnimationProperty";
import { Entity } from "./../../../Entity";

/**
 * @internal
 */
export class AnimationFloatCurveOwner extends AnimationCurveOwner {
  protected _defaultValue: number;
  protected _fixedPoseValue: number;
  protected _propertyReference: PropertyReference;
  protected _baseTempValue: number;
  protected _crossTempValue: number;

  private _targetValue: number;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    this._propertyReference = this._getPropertyReference();
    const { mounted, propertyName } = this._propertyReference;
    this._targetValue = mounted[propertyName] as number;
  }

  saveDefaultValue() {
    this._defaultValue = this._targetValue;
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue() {
    this._fixedPoseValue = this._targetValue;
  }

  revertDefaultValue() {
    if (!this._hasSavedDefaultValue) return;

    const { mounted, propertyName } = this._propertyReference;
    mounted[propertyName] = this._defaultValue;
  }

  protected _applyValue(value: number, weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    (<number>mounted[propertyName]) += (value - <number>mounted[propertyName]) * weight;
  }

  protected _applyAdditiveVale(value: number, weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    (<number>mounted[propertyName]) += value * weight;
  }

  protected _applyCrossValue(
    srcValue: number,
    destValue: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const value = srcValue + (destValue - srcValue) * crossWeight;
    if (additive) {
      this._applyAdditiveVale(value, layerWeight);
    } else {
      this._applyValue(value, layerWeight);
    }
  }
}
