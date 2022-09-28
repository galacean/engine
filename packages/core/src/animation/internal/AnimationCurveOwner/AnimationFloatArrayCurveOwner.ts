import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { SkinnedMeshRenderer } from "../../../mesh";
import { AnimationProperty, AnimationPropertyInternal } from "../../enums/AnimationProperty";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class AnimationFloatArrayCurveOwner extends AnimationCurveOwner<Float32Array, Float32Array> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    super(target, type, property);
    const size = this._targetValue.length;
    this._defaultValue = new Float32Array(size);
    this._fixedPoseValue = new Float32Array(size);
    this._baseTempValue = new Float32Array(size);
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

  revertDefaultValue() {
    if (!this._hasSavedDefaultValue) return;

    this._assembler.setValue(this._defaultValue);
  }

  protected _applyValue(value: Float32Array, weight: number) {
    if (weight === 1.0) {
      this._assembler.setValue(value);
    } else {
      const originValue = this._assembler.getValue();
      for (let i = 0, n = originValue.length; i < n; ++i) {
        originValue[i] += (value[i] - originValue[i]) * weight;
      }
    }
  }

  protected _applyAdditiveValue(value: Float32Array, weight: number) {
    const targetValue = this._assembler.getValue();

    for (let i = 0, n = targetValue.length; i < n; ++i) {
      targetValue[i] += value[i] * weight;
    }
  }

  protected _lerpValue(
    srcValue: Float32Array,
    destValue: Float32Array,
    crossWeight: number,
    out: Float32Array
  ): Float32Array {
    for (let i = 0, n = out.length; i < n; ++i) {
      const src = srcValue[i];
      out[i] = src + (destValue[i] - src) * crossWeight;
    }
    return out;
  }
}
