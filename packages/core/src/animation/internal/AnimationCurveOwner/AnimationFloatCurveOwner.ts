import { Component } from "../../../Component";
import { Entity } from "./../../../Entity";
import { AnimationCurveOwner } from "./AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationFloatCurveOwner extends AnimationCurveOwner<number, number> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    super(target, type, property);
  }

  saveDefaultValue(): void {
    this._defaultValue = this._targetValue;
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    this._fixedPoseValue = this._targetValue;
  }

  revertDefaultValue(): void {
    if (!this._hasSavedDefaultValue) return;

    this._assembler.setValue(this._defaultValue);
  }

  protected _applyValue(value: number, weight: number): void {
    const { mounted, propertyName } = this._propertyReference;
    mounted[propertyName] += (value - mounted[propertyName]) * weight;
  }

  protected _applyAdditiveValue(value: number, weight: number): void {
    const { mounted, propertyName } = this._propertyReference;
    mounted[propertyName] += value * weight;
  }

  protected _lerpValue(srcValue: number, destValue: number, crossWeight: number, out: number): number {
    return srcValue + (destValue - srcValue) * crossWeight;
  }
}
