import { Color } from "@oasis-engine/math";
import { Vector4 } from "@oasis-engine/math/src";
import { Component } from "../../../Component";
import { Entity } from "./../../../Entity";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class AnimationColorCurveOwner extends AnimationCurveOwner<Vector4, Color> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    super(target, type, property);
    this._defaultValue = new Color();
    this._fixedPoseValue = new Color();
    this._baseTempValue = new Color();
    this._crossTempValue = new Color();
  }

  saveDefaultValue(): void {
    this._defaultValue.copyFrom(this._targetValue);
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    this._fixedPoseValue.copyFrom(this._targetValue);
  }

  revertDefaultValue(): void {
    if (!this._hasSavedDefaultValue) return;

    this._assembler.setValue(this._defaultValue);
  }

  protected _applyValue(value: Color, weight: number): void {
    if (weight === 1.0) {
      this._assembler.setValue(value);
    } else {
      const originValue = this._assembler.getValue();
      Color.lerp(originValue, value, weight, originValue);
    }
  }

  protected _applyAdditiveValue(value: Color, weight: number): void {
    const originValue = this._assembler.getValue();
    originValue.r += value.r * weight;
    originValue.g += value.g * weight;
    originValue.b += value.b * weight;
    originValue.a += value.a * weight;
  }

  protected _lerpValue(srcValue: Color, destValue: Color, crossWeight: number, out: Color): Color {
    Color.lerp(srcValue, destValue, crossWeight, out);
    return out;
  }
}
