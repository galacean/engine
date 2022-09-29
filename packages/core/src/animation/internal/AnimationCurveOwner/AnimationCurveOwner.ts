import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurve } from "../../AnimationCurve";
import { IAnimationCurveCalculator } from "../../AnimationCurve/interfaces/IAnimationCurveCalculator";
import { KeyframeValueType } from "../../Keyframe";
import { IAnimationCurveOwnerAssembler } from "./Assembler/IAnimationCurveOwnerAssembler";
import { UniversalAnimationCurveOwnerAssembler } from "./Assembler/UniversalAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export abstract class AnimationCurveOwner<V extends KeyframeValueType> {
  private static _assemblerMap = new Map<ComponentType, Record<string, AssemblerType>>();

  static registerAssembler(compomentType: ComponentType, property: string, assemblerType: AssemblerType): void {
    let subMap = AnimationCurveOwner._assemblerMap.get(compomentType);
    if (!subMap) {
      subMap = {};
      AnimationCurveOwner._assemblerMap.set(compomentType, subMap);
    }
    subMap[property] = assemblerType;
  }

  static getAssemblerType(compomentType: ComponentType, property: string): AssemblerType {
    const subMap = AnimationCurveOwner._assemblerMap.get(compomentType);
    return subMap ? subMap[property] : UniversalAnimationCurveOwnerAssembler<KeyframeValueType>;
  }

  readonly target: Entity;
  readonly type: new (entity: Entity) => Component;
  readonly property: string;
  readonly component: Component;

  crossCurveMark: number = 0;
  crossCurveDataIndex: number;
  defaultValue: V;
  fixedPoseValue: V;
  baseTempValue: V;
  crossTempValue: V;
  hasSavedDefaultValue: boolean = false;

  protected _assembler: IAnimationCurveOwnerAssembler<V>;

  abstract cureType: IAnimationCurveCalculator<V>;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    this.target = target;
    this.type = type;
    this.property = property;
    this.component = target.getComponent(type);

    const assemblerType = AnimationCurveOwner.getAssemblerType(type, property);
    this._assembler = <IAnimationCurveOwnerAssembler<V>>new assemblerType();
    this._assembler.initialize(this);
  }

  evaluateAndApplyValue(curve: AnimationCurve<V>, time: number, layerWeight: number): void {
    if (curve.keys.length) {
      const value = curve._evaluate(time, this.baseTempValue);
      this._applyValue(value, layerWeight);
    }
  }

  evaluateAndApplyAdditiveValue(curve: AnimationCurve<V>, time: number, layerWeight: number): void {
    if (curve.keys.length) {
      const value = curve._evaluateAdditive(time, this.baseTempValue);
      this._applyAdditiveValue(value, layerWeight);
    }
  }

  crossFadeAndApplyValue(
    srcCurve: AnimationCurve<V>,
    destCurve: AnimationCurve<V>,
    srcTime: number,
    destTime: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const srcValue =
      srcCurve && srcCurve.keys.length ? srcCurve._evaluate(srcTime, this.baseTempValue) : this.defaultValue;
    const destValue =
      destCurve && destCurve.keys.length ? destCurve._evaluate(destTime, this.crossTempValue) : this.defaultValue;
    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  crossFadeFromPoseAndApplyValue(
    destCurve: AnimationCurve<V>,
    destTime: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const srcValue = this.fixedPoseValue;
    const destValue =
      destCurve && destCurve.keys.length ? destCurve._evaluate(destTime, this.crossTempValue) : this.defaultValue;
    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  revertDefaultValue(): void {
    this._assembler.setTargetValue(this.defaultValue);
  }

  protected _applyValue(value: V, weight: number): void {
    if (weight === 1.0) {
      this._assembler.setTargetValue(value);
    } else {
      this._applyLerpValue(value, weight);
    }
  }

  private _applyCrossValue(
    srcValue: V,
    destValue: V,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const out = this._lerpCrossValue(srcValue, destValue, crossWeight);
    if (additive) {
      this._applyAdditiveValue(out, layerWeight);
    } else {
      this._applyValue(out, layerWeight);
    }
  }

  abstract saveDefaultValue(): void;
  abstract saveFixedPoseValue(): void;

  protected abstract _applyLerpValue(value: V, weight: number): void;
  protected abstract _applyAdditiveValue(value: V, weight: number): void;
  protected abstract _lerpCrossValue(srcValue: V, destValue: V, weight: number): V;
}

type ComponentType = new (entity: Entity) => Component;
type AssemblerType = new () => IAnimationCurveOwnerAssembler<KeyframeValueType>;
