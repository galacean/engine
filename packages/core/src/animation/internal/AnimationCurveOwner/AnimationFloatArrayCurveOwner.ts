import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { SkinnedMeshRenderer } from "../../../mesh";
import { AnimationProperty, AnimationPropertyInternal } from "../../enums/AnimationProperty";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
/**
 * @internal
 */
export class AnimationFloatArrayCurveOwner extends AnimationCurveOwner<Float32Array, Float32Array> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    switch (property) {
      case AnimationPropertyInternal.BlendShapeWeights:
        this._targetValue = (this.component as SkinnedMeshRenderer).blendShapeWeights;
        break;
      default:
        this._propertyReference = this._getPropertyReference();
        const { mounted, propertyName } = this._propertyReference;
        this._targetValue = mounted[propertyName];
        break;
    }
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

    const { property } = this;
    switch (property) {
      case AnimationPropertyInternal.BlendShapeWeights:
        (this.component as SkinnedMeshRenderer).blendShapeWeights = this._defaultValue;
        break;
      default:
        const { mounted, propertyName } = this._propertyReference;
        mounted[propertyName] = this._defaultValue;
        break;
    }
  }

  protected _applyValue(value: Float32Array, weight: number) {
    const { component, property } = this;
    switch (property) {
      case AnimationPropertyInternal.BlendShapeWeights: {
        const skinnedMeshRenderer = component as SkinnedMeshRenderer;
        if (weight === 1.0) {
          skinnedMeshRenderer.blendShapeWeights = value;
        } else {
          const { blendShapeWeights } = skinnedMeshRenderer;
          for (let i = 0, n = blendShapeWeights.length; i < n; ++i) {
            blendShapeWeights[i] += (value[i] - blendShapeWeights[i]) * weight;
          }
        }
        break;
      }
      default:
        const { mounted, propertyName } = this._propertyReference;
        if (weight === 1.0) {
          mounted[propertyName] = value;
        } else {
          const originValue = mounted[propertyName];
          for (let i = 0, n = originValue.length; i < n; ++i) {
            originValue[i] += (value[i] - originValue[i]) * weight;
          }
        }
        break;
    }
  }

  protected _applyAdditiveValue(value: Float32Array, weight: number) {
    const { component, property } = this;
    switch (property) {
      case AnimationPropertyInternal.BlendShapeWeights: {
        const { blendShapeWeights } = <SkinnedMeshRenderer>component;
        for (let i = 0, n = blendShapeWeights.length; i < n; ++i) {
          blendShapeWeights[i] += value[i] * weight;
        }
        break;
      }
      default:
        const { mounted, propertyName } = this._propertyReference;
        const originValue = mounted[propertyName];
        for (let i = 0, n = originValue.length; i < n; ++i) {
          originValue[i] += value[i] * weight;
        }
        break;
    }
  }

  protected _applyCrossValue(
    srcValue: Float32Array,
    destValue: Float32Array,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const value = this._baseTempValue;
    for (let i = 0, n = value.length; i < n; ++i) {
      value[i] = srcValue[i] + (destValue[i] - srcValue[i]) * crossWeight;
    }
    if (additive) {
      this._applyAdditiveValue(value, layerWeight);
    } else {
      this._applyValue(value, layerWeight);
    }
  }
}
