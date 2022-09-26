import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurve } from "../../AnimationCurve";
import { AnimationProperty } from "../../enums/AnimationProperty";
import { KeyFrameTangentType, KeyFrameValueType } from "../../KeyFrame";

/**
 * @internal
 */
export interface PropertyReference {
  mounted: { [key: string]: KeyFrameValueType };
  propertyName: string;
}

/**
 * @internal
 */
export abstract class AnimationCurveOwner {
  crossCurveMark: number = 0;
  crossCurveDataIndex: number;

  readonly target: Entity;
  readonly type: new (entity: Entity) => Component;
  readonly property: AnimationProperty;
  readonly component: Component;

  protected _hasSavedDefaultValue: boolean = false;

  protected abstract _defaultValue: KeyFrameValueType;
  protected abstract _fixedPoseValue: KeyFrameValueType;
  protected abstract _propertyReference: PropertyReference;
  protected abstract _baseTempValue: KeyFrameValueType;
  protected abstract _crossTempValue: KeyFrameValueType;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    this.target = target;
    this.type = type;
    this.property = property;
    this.component = target.getComponent(type);
  }

  evaluateAndApplyValue(
    curve: AnimationCurve<KeyFrameTangentType, KeyFrameValueType>,
    time: number,
    layerWeight: number
  ) {
    if (curve.keys.length) {
      const value = curve._evaluate(time, this._baseTempValue);
      this._applyValue(value, layerWeight);
    }
  }

  evaluateAndApplyAdditiveValue(
    curve: AnimationCurve<KeyFrameTangentType, KeyFrameValueType>,
    time: number,
    layerWeight: number
  ) {
    if (curve.keys.length) {
      const value = curve._evaluateAdditive(time, this._baseTempValue);
      this._applyAdditiveVale(value, layerWeight);
    }
  }

  crossFadeAndApplyValue(
    srcCurve: AnimationCurve<KeyFrameTangentType, KeyFrameValueType> | undefined,
    destCurve: AnimationCurve<KeyFrameTangentType, KeyFrameValueType> | undefined,
    srcTime: number,
    destTime: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const srcValue =
      srcCurve && srcCurve.keys.length ? srcCurve._evaluate(srcTime, this._baseTempValue) : this._defaultValue;
    const destValue =
      destCurve && destCurve.keys.length ? destCurve._evaluate(destTime, this._crossTempValue) : this._defaultValue;
    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  crossFadeFromPoseAndApplyValue(
    destCurve: AnimationCurve<KeyFrameTangentType, KeyFrameValueType> | undefined,
    destTime: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const srcValue = this._fixedPoseValue;
    const destValue =
      destCurve && destCurve.keys.length ? destCurve._evaluate(destTime, this._crossTempValue) : this._defaultValue;
    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  abstract saveDefaultValue(): void;
  abstract saveFixedPoseValue(): void;
  abstract revertDefaultValue(): void;

  protected _getPropertyReference() {
    let mounted: any = this.component;
    const properties = (this.property as string).split(".");
    for (let i = 0, n = properties.length; i < n - 1; ++i) {
      mounted = mounted[properties[i]];
    }

    return {
      mounted,
      propertyName: properties[properties.length - 1]
    };
  }

  protected abstract _applyValue(value: KeyFrameValueType, weight: number): void;
  protected abstract _applyAdditiveVale(value: KeyFrameValueType, weight: number): void;
  protected abstract _applyCrossValue(
    srcValue: KeyFrameValueType,
    destValue: KeyFrameValueType,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void;
}
