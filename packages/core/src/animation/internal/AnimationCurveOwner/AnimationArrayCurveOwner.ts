import { AnimationCurveOwner, PropertyReference } from "./AnimationCurveOwner";
import { Component } from "../../../Component";
import { AnimationProperty } from "../../enums/AnimationProperty";
import { Entity } from "./../../../Entity";

/**
 * @internal
 */
export class AnimationArrayCurveOwner extends AnimationCurveOwner {
  protected _defaultValue: number[] = [];
  protected _fixedPoseValue: number[] = [];
  protected _propertyReference: PropertyReference;
  protected _baseTempValue: number[] = [];
  protected _crossTempValue: number[] = [];

  private _targetValue: number[];

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    this._propertyReference = this._getPropertyReference();
    const { mounted, propertyName } = this._propertyReference;
    this._targetValue = mounted[propertyName] as number[];
  }

  saveDefaultValue() {
    const arr = this._targetValue;
    for (let i = 0, length = arr.length; i < length; ++i) {
      this._defaultValue[i] = arr[i];
    }
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue() {
    const arr = this._targetValue;
    for (let i = 0, length = arr.length; i < length; ++i) {
      this._defaultValue[i] = arr[i];
    }
  }

  revertDefaultValue() {
    if (!this._hasSavedDefaultValue) return;

    const { mounted, propertyName } = this._propertyReference;
    mounted[propertyName] = this._defaultValue;
  }

  protected _applyValue(value: number[], weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    if (weight === 1.0) {
      mounted[propertyName] = value;
    } else {
      const originValue = mounted[propertyName] as number[];
      for (let i = 0, length = originValue.length; i < length; ++i) {
        originValue[i] += (value[i] - originValue[i]) * weight;
      }
    }
  }

  protected _applyAdditiveVale(value: number[], weight: number) {
    const { mounted, propertyName } = this._propertyReference;
    const originValue = mounted[propertyName] as number[];
    for (let i = 0, length = originValue.length; i < length; ++i) {
      originValue[i] += value[i] * weight;
    }
  }

  protected _applyCrossValue(
    srcValue: number[],
    destValue: number[],
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const value = this._baseTempValue;
    for (let i = 0, length = value.length; i < length; ++i) {
      value[i] = srcValue[i] + (destValue[i] - srcValue[i]) * crossWeight;
    }
    if (additive) {
      this._applyAdditiveVale(value, layerWeight);
    } else {
      this._applyValue(value, layerWeight);
    }
  }
}
