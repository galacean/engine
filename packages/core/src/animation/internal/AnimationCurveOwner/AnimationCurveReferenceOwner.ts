import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { IAnimationReferenceCurveOperation } from "../../AnimationCurve/IAnimationReferenceCurveOperation";
import { KeyframeTangentType, KeyframeValueType } from "../../KeyFrame";
import { AnimationCurveOwner } from "./AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationCurveReferenceOwner<
  T extends KeyframeTangentType,
  V extends KeyframeValueType
> extends AnimationCurveOwner<T, V> {
  /** @intenral */
  _cureType: IAnimationReferenceCurveOperation<V>;

  /**
   * @internal
   */
  _targetValue: V;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    super(target, type, property);
    this._targetValue = this._assembler.getValue();
  }

  saveDefaultValue(): void {
    this._cureType._copyFrom(this._targetValue, this._defaultValue);
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    this._cureType._copyFrom(this._targetValue, this._fixedPoseValue);
  }

  revertDefaultValue(): void {
    if (!this._hasSavedDefaultValue) {
      return;
    }
    this._assembler.setValue(this._defaultValue);
  }

  protected _applyValue(value: V, weight: number): void {
    if (weight === 1.0) {
      this._assembler.setValue(value);
    } else {
      const targetValue = this._targetValue;
      this._cureType._lerpValue(targetValue, value, weight, targetValue);
    }
  }

  protected _applyAdditiveValue(value: V, weight: number): void {
    this._cureType._additiveValue(value, weight, this._targetValue);
  }

  protected _applyCrossValue(
    srcValue: V,
    destValue: V,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const out = this._baseTempValue;
    this._cureType._lerpValue(srcValue, destValue, crossWeight, out);
    if (additive) {
      this._applyAdditiveValue(out, layerWeight);
    } else {
      this._applyValue(out, layerWeight);
    }
  }
}
