import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurve } from "../../AnimationCurve";
import { AnimationProperty } from "../../enums/AnimationProperty";
import { KeyFrameTangentType, KeyFrameValueType } from "../../KeyFrame";

/**
 * @internal
 */
export interface PropertyReference<V extends KeyFrameValueType> {
  mounted: Record<string, V>;
  propertyName: string;
}

/**
 * @internal
 */
export abstract class AnimationCurveOwner<T extends KeyFrameTangentType, V extends KeyFrameValueType> {
  crossCurveMark: number = 0;
  crossCurveDataIndex: number;

  readonly target: Entity;
  readonly type: new (entity: Entity) => Component;
  readonly property: AnimationProperty;
  readonly component: Component;

  protected _hasSavedDefaultValue: boolean = false;

  protected _defaultValue: V;
  protected _fixedPoseValue: V;
  protected _propertyReference: PropertyReference<V>;
  protected _baseTempValue: V;
  protected _crossTempValue: V;
  protected _targetValue: V;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    this.target = target;
    this.type = type;
    this.property = property;
    this.component = target.getComponent(type);
  }

  evaluateAndApplyValue(curve: AnimationCurve<T, V>, time: number, layerWeight: number): void {
    if (curve.keys.length) {
      const value = curve._evaluate(time, this._baseTempValue);
      this._applyValue(value, layerWeight);
    }
  }

  evaluateAndApplyAdditiveValue(curve: AnimationCurve<T, V>, time: number, layerWeight: number): void {
    if (curve.keys.length) {
      const value = curve._evaluateAdditive(time, this._baseTempValue);
      this._applyAdditiveValue(value, layerWeight);
    }
  }

  crossFadeAndApplyValue(
    srcCurve: AnimationCurve<T, V>,
    destCurve: AnimationCurve<T, V>,
    srcTime: number,
    destTime: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const srcValue =
      srcCurve && srcCurve.keys.length ? srcCurve._evaluate(srcTime, this._baseTempValue) : this._defaultValue;
    const destValue =
      destCurve && destCurve.keys.length ? destCurve._evaluate(destTime, this._crossTempValue) : this._defaultValue;
    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  crossFadeFromPoseAndApplyValue(
    destCurve: AnimationCurve<T, V>,
    destTime: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const srcValue = this._fixedPoseValue;
    const destValue =
      destCurve && destCurve.keys.length ? destCurve._evaluate(destTime, this._crossTempValue) : this._defaultValue;
    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  abstract saveDefaultValue(): void;
  abstract saveFixedPoseValue(): void;
  abstract revertDefaultValue(): void;

  protected _getPropertyReference(): PropertyReference<V> {
    let mounted: any = this.component;
    const properties = (this.property as string).split(".");
    for (let i = 0, n = properties.length; i < n - 1; i++) {
      mounted = mounted[properties[i]];
    }

    return {
      mounted,
      propertyName: properties[properties.length - 1]
    };
  }

  protected abstract _applyValue(value: V, weight: number): void;
  protected abstract _applyAdditiveValue(value: V, weight: number): void;
  protected abstract _applyCrossValue(
    srcValue: V,
    destValue: V,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void;
}
