import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { IAnimationReferenceCurveStatic } from "../../AnimationCurve/interfaces/IAnimationReferenceCurveStatic";
import { KeyframeTangentType, KeyframeValueType } from "../../KeyFrame";
import { AnimationCurveOwner } from "./AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationCurveReferenceOwner<
  T extends KeyframeTangentType,
  V extends KeyframeValueType
> extends AnimationCurveOwner<T, V> {
  cureType: IAnimationReferenceCurveStatic<T, V>;
  targetValue: V;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    super(target, type, property);
    this.targetValue = this._assembler.getTargetValue();
  }

  saveDefaultValue(): void {
    this.cureType._copyFrom(this.targetValue, this.defaultValue);
    this.hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    this.cureType._copyFrom(this.targetValue, this.fixedPoseValue);
  }

  protected _applyValue(value: V, weight: number): void {
    if (weight === 1.0) {
      this._assembler.setTargetValue(value);
    } else {
      const targetValue = this.targetValue;
      this.cureType._lerpValue(targetValue, value, weight, targetValue);
    }
  }

  protected _applyAdditiveValue(value: V, weight: number): void {
    this.cureType._additiveValue(value, weight, this.targetValue);
  }

  protected _applyCrossValue(
    srcValue: V,
    destValue: V,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const out = this.baseTempValue;
    this.cureType._lerpValue(srcValue, destValue, crossWeight, out);
    if (additive) {
      this._applyAdditiveValue(out, layerWeight);
    } else {
      this._applyValue(out, layerWeight);
    }
  }
}
