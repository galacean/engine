import { IAnimationValueCurveStatic } from "../../AnimationCurve/interfaces/IAnimationValueCurveStatic";
import { AnimationCurveOwner } from "./AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationCurveValueOwner<T extends number, V extends number> extends AnimationCurveOwner<T, V> {
  /** @intenral */
  _cureType: IAnimationValueCurveStatic<T, V>;

  saveDefaultValue(): void {
    this._defaultValue = this._assembler.getTargetValue();
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    this._fixedPoseValue = this._assembler.getTargetValue();
  }

  revertDefaultValue(): void {
    this._assembler.setTargetValue(this._defaultValue);
  }

  protected _applyValue(value: V, weight: number): void {
    if (weight === 1.0) {
      this._assembler.setTargetValue(value);
    } else {
      const originValue = this._assembler.getTargetValue();
      const lerpValue = this._cureType._lerpValue(originValue, value, weight);
      this._assembler.setTargetValue(lerpValue);
    }
  }

  protected _applyAdditiveValue(value: V, weight: number): void {
    const originValue = this._assembler.getTargetValue();
    const lerpValue = this._cureType._additiveValue(value, weight, originValue);
    this._assembler.setTargetValue(lerpValue);
  }

  protected _applyCrossValue(
    srcValue: V,
    destValue: V,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const out = this._cureType._lerpValue(srcValue, destValue, crossWeight);
    if (additive) {
      this._applyAdditiveValue(out, layerWeight);
    } else {
      this._applyValue(out, layerWeight);
    }
  }
}
