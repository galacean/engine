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
export class AnimationCurveOwner<V extends KeyframeValueType> {
  private static _assemblerMap = new Map<ComponentType, Record<string, AssemblerType>>();

  static registerAssembler(componentType: ComponentType, property: string, assemblerType: AssemblerType): void {
    let subMap = AnimationCurveOwner._assemblerMap.get(componentType);
    if (!subMap) {
      subMap = {};
      AnimationCurveOwner._assemblerMap.set(componentType, subMap);
    }
    subMap[property] = assemblerType;
  }

  static getAssemblerType(componentType: ComponentType, property: string): AssemblerType {
    const subMap = AnimationCurveOwner._assemblerMap.get(componentType);
    return subMap?.property ?? UniversalAnimationCurveOwnerAssembler<KeyframeValueType>;
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
  cureType: IAnimationCurveCalculator<V>;
  isReferenceType: boolean;
  referenceTargetValue: V;

  private _assembler: IAnimationCurveOwnerAssembler<V>;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: string, isReferenceType: boolean) {
    this.target = target;
    this.type = type;
    this.property = property;
    this.component = target.getComponent(type);

    const assemblerType = AnimationCurveOwner.getAssemblerType(type, property);
    this._assembler = <IAnimationCurveOwnerAssembler<V>>new assemblerType();
    this._assembler.initialize(this);
    if (isReferenceType) {
      this.referenceTargetValue = this._assembler.getTargetValue();
    }
    this.isReferenceType = isReferenceType;
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

      if (this.isReferenceType) {
        this.cureType._additiveValue(value, layerWeight, this.referenceTargetValue);
      } else {
        const originValue = this._assembler.getTargetValue();
        const additiveValue = this.cureType._additiveValue(value, layerWeight, originValue);
        this._assembler.setTargetValue(additiveValue);
      }
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

  saveDefaultValue(): void {
    if (this.isReferenceType) {
      this.cureType._copyValue(this.referenceTargetValue, this.defaultValue);
    } else {
      this.defaultValue = this._assembler.getTargetValue();
    }
    this.hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    if (this.isReferenceType) {
      this.cureType._copyValue(this.referenceTargetValue, this.fixedPoseValue);
    } else {
      this.fixedPoseValue = this._assembler.getTargetValue();
    }
  }

  private _applyValue(value: V, weight: number): void {
    if (weight === 1.0) {
      if (this.isReferenceType) {
        this.cureType._copyValue(value, this.referenceTargetValue);
      } else {
        this._assembler.setTargetValue(value);
      }
    } else {
      if (this.isReferenceType) {
        const targetValue = this.referenceTargetValue;
        this.cureType._lerpValue(targetValue, value, weight, targetValue);
      } else {
        const originValue = this._assembler.getTargetValue();
        const lerpValue = this.cureType._lerpValue(originValue, value, weight);
        this._assembler.setTargetValue(lerpValue);
      }
    }
  }

  private _applyCrossValue(
    srcValue: V,
    destValue: V,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    let out: V;
    if (this.isReferenceType) {
      out = this.baseTempValue;
      this.cureType._lerpValue(srcValue, destValue, crossWeight, out);
    } else {
      out = this.cureType._lerpValue(srcValue, destValue, crossWeight);
    }

    if (additive) {
      if (this.isReferenceType) {
        this.cureType._additiveValue(out, layerWeight, this.referenceTargetValue);
      } else {
        const originValue = this._assembler.getTargetValue();
        const lerpValue = this.cureType._additiveValue(out, layerWeight, originValue);
        this._assembler.setTargetValue(lerpValue);
      }
    } else {
      this._applyValue(out, layerWeight);
    }
  }
}

type ComponentType = new (entity: Entity) => Component;
type AssemblerType = new () => IAnimationCurveOwnerAssembler<KeyframeValueType>;
