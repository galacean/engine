import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurve } from "../../AnimationCurve";
import { AnimationProperty } from "../../enums/AnimationProperty";
import { InterpolableValue } from "../../KeyFrame";

export { AnimationFloatCurveOwner } from "./AnimationFloatCurveOwner";
export { AnimationVector2CurveOwner } from "./AnimationVector2CurveOwner";
export { AnimationVector3CurveOwner } from "./AnimationVector3CurveOwner";
export { AnimationVector4CurveOwner } from "./AnimationVector4CurveOwner";
export { AnimationQuatCurveOwner } from "./AnimationQuatCurveOwner";
export { AnimationColorCurveOwner } from "./AnimationColorCurveOwner";
export { AnimationFloatArrayCurveOwner } from "./AnimationFloatArrayCurveOwner";
export { AnimationArrayCurveOwner } from "./AnimationArrayCurveOwner";

/**
 * @internal
 */
export interface PropertyReference {
  mounted: { [key: string]: InterpolableValue };
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

  /** @internal */
  _hasSavedDefaultValue: boolean = false;

  protected abstract _defaultValue: InterpolableValue;
  protected abstract _fixedPoseValue: InterpolableValue;
  protected abstract _propertyReference: PropertyReference;
  protected abstract _baseTempValue: InterpolableValue;
  protected abstract _crossTempValue: InterpolableValue;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    this.target = target;
    this.type = type;
    this.property = property;
    this.component = target.getComponent(type);
  }

  evaluateAndApplyValue(curve: AnimationCurve, time: number, layerWeight: number) {
    const value = curve._evaluate(time, this._baseTempValue);
    this._applyValue(value, layerWeight);
  }

  evaluateAndApplyAdditiveValue(curve: AnimationCurve, time: number, layerWeight: number) {
    const value = curve._evaluateAdditive(time, this._baseTempValue);
    this._applyAdditiveVale(value, layerWeight);
  }

  crossFadeAndApplyValue(
    srcCurve: AnimationCurve | undefined,
    destCurve: AnimationCurve | undefined,
    srcTime: number,
    destTime: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const srcValue = srcCurve ? srcCurve._evaluate(srcTime, this._baseTempValue) : this._defaultValue;
    const destValue = destCurve ? destCurve._evaluate(destTime, this._crossTempValue) : this._defaultValue;
    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  crossFadeFromPoseAndApplyValue(
    destCurve: AnimationCurve | undefined,
    destTime: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const srcValue = this._fixedPoseValue;
    const destValue = destCurve ? destCurve._evaluate(destTime, this._crossTempValue) : this._defaultValue;
    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  revertDefaultValue() {
    const { mounted, propertyName } = this._propertyReference;
    if (!this._hasSavedDefaultValue) return;
    mounted[propertyName] = this._defaultValue;
  }

  abstract saveDefaultValue(): void;
  abstract saveFixedPoseValue(): void;

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

  protected abstract _applyValue(value: InterpolableValue, weight: number): void;
  protected abstract _applyAdditiveVale(value: InterpolableValue, weight: number): void;
  protected abstract _applyCrossValue(
    srcValue: InterpolableValue,
    destValue: InterpolableValue,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void;
}
