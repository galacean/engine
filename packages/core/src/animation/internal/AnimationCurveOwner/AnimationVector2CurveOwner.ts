import { Vector2 } from "@oasis-engine/math";
import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class AnimationVector2CurveOwner extends AnimationCurveOwner<Vector2, Vector2> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    super(target, type, property);
    this._defaultValue = new Vector2();
    this._fixedPoseValue = new Vector2();
    this._baseTempValue = new Vector2();
    this._crossTempValue = new Vector2();
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

    this._assembler.setValue(this._defaultValue);
  }

  protected _applyValue(value: Vector2, weight: number): void {
    if (weight === 1.0) {
      this._assembler.setValue(value);
    } else {
      const originValue = this._assembler.getValue();
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

  protected _lerpValue(srcValue: Vector2, destValue: Vector2, crossWeight: number, out: Vector2): Vector2 {
    Vector2.lerp(srcValue, destValue, crossWeight, out);
    return out;
  }
}
