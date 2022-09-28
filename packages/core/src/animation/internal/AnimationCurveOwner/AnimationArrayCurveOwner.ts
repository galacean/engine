import { Component } from "../../../Component";
import { AnimationProperty } from "../../enums/AnimationProperty";
import { Entity } from "./../../../Entity";
import { AnimationCurveOwner } from "./AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationArrayCurveOwner extends AnimationCurveOwner<number[], number[]> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    this._propertyReference = this._getPropertyReference();
    const { mounted, propertyName } = this._propertyReference;
    this._targetValue = mounted[propertyName];
  }

  saveDefaultValue(): void {
    const arr = this._targetValue;
    for (let i = 0, n = arr.length; i < n; ++i) {
      this._defaultValue[i] = arr[i];
    }
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    const arr = this._targetValue;
    for (let i = 0, n = arr.length; i < n; ++i) {
      this._defaultValue[i] = arr[i];
    }
  }

  revertDefaultValue(): void {
    if (!this._hasSavedDefaultValue) return;

    const { mounted, propertyName } = this._propertyReference;
    mounted[propertyName] = this._defaultValue;
  }

  protected _applyValue(value: number[], weight: number): void {
    const { mounted, propertyName } = this._propertyReference;
    if (weight === 1.0) {
      mounted[propertyName] = value;
    } else {
      const originValue = mounted[propertyName];
      for (let i = 0, n = originValue.length; i < n; ++i) {
        originValue[i] += (value[i] - originValue[i]) * weight;
      }
    }
  }

  protected _applyAdditiveValue(value: number[], weight: number): void {
    const { mounted, propertyName } = this._propertyReference;
    const originValue = mounted[propertyName];
    for (let i = 0, n = originValue.length; i < n; ++i) {
      originValue[i] += value[i] * weight;
    }
  }

  protected _lerpValue(srcValue: number[], destValue: number[], crossWeight: number, out: number[]): number[] {
    for (let i = 0, n = out.length; i < n; ++i) {
      const src = srcValue[i];
      out[i] = src + (destValue[i] - src) * crossWeight;
    }
    return out;
  }
}
