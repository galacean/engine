import { Quaternion } from "@oasis-engine/math";
import { Vector4 } from "@oasis-engine/math/src";
import { Component } from "../../../Component";
import { Entity } from "./../../../Entity";
import { AnimatorUtils } from "./../../AnimatorUtils";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class AnimationQuaternionCurveOwner extends AnimationCurveOwner<Vector4, Quaternion> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    super(target, type, property);

    this._defaultValue = new Quaternion();
    this._fixedPoseValue = new Quaternion();
    this._baseTempValue = new Quaternion();
    this._crossTempValue = new Quaternion();
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

  protected _applyValue(value: Quaternion, weight: number) {
    if (weight === 1.0) {
      this._assembler.setValue(value);
    } else {
      const targetValue = this._assembler.getValue();
      Quaternion.slerp(targetValue, value, weight, targetValue);
    }
  }

  protected _applyAdditiveValue(value: Quaternion, weight: number) {
    const targetValue = this._assembler.getValue();
    AnimatorUtils.quaternionWeight(value, weight, value);
    value.normalize();
    targetValue.multiply(value);
  }

  protected _lerpValue(srcValue: Quaternion, destValue: Quaternion, crossWeight: number, out: Quaternion): Quaternion {
    Quaternion.slerp(srcValue, destValue, crossWeight, out);
    return out;
  }
}
