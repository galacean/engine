import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurve } from "../../animationCurve/AnimationCurve";
import { IAnimationCurveCalculator } from "../../animationCurve/interfaces/IAnimationCurveCalculator";
import { KeyframeValueType } from "../../Keyframe";
import { IAnimationCurveOwnerAssembler } from "./assembler/IAnimationCurveOwnerAssembler";
import { UniversalAnimationCurveOwnerAssembler } from "./assembler/UniversalAnimationCurveOwnerAssembler";

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
    const assemblerType = subMap ? subMap[property] : undefined;
    return assemblerType ?? UniversalAnimationCurveOwnerAssembler<KeyframeValueType>;
  }

  readonly target: Entity;
  readonly type: new (entity: Entity) => Component;
  readonly property: string;
  readonly component: Component;

  crossCurveMark: number = 0;
  crossCurveDataIndex: number;
  defaultValue: V;
  fixedPoseValue: V;
  hasSavedDefaultValue: boolean = false;
  baseEvaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null };

  crossEvaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null };
  crossSrcCurveIndex: number;
  crossDestCurveIndex: number;

  referenceTargetValue: V;

  private _assembler: IAnimationCurveOwnerAssembler<V>;
  private _cureType: IAnimationCurveCalculator<V>;

  constructor(
    target: Entity,
    type: new (entity: Entity) => Component,
    property: string,
    cureType: IAnimationCurveCalculator<V>
  ) {
    this.target = target;
    this.type = type;
    this.property = property;
    this.component = target.getComponent(type);
    this._cureType = cureType;

    const assemblerType = AnimationCurveOwner.getAssemblerType(type, property);
    this._assembler = <IAnimationCurveOwnerAssembler<V>>new assemblerType();
    this._assembler.initialize(this);

    if (cureType._isReferenceType) {
      this.referenceTargetValue = this._assembler.getTargetValue();
    }
  }

  evaluateAndApplyValue(curve: AnimationCurve<V>, time: number, layerWeight: number, additive: boolean): void {
    if (curve.keys.length) {
      if (additive) {
        const value = curve._evaluateAdditive(time, this.baseEvaluateData);

        const cureType = this._cureType;
        if (cureType._isReferenceType) {
          cureType._additiveValue(value, layerWeight, this.referenceTargetValue);
        } else {
          const assembler = this._assembler;
          const originValue = assembler.getTargetValue();
          const additiveValue = cureType._additiveValue(value, layerWeight, originValue);
          assembler.setTargetValue(additiveValue);
        }
      } else {
        const value = curve._evaluate(time, this.baseEvaluateData);

        this._applyValue(value, layerWeight);
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
      srcCurve && srcCurve.keys.length
        ? additive
          ? srcCurve._evaluateAdditive(srcTime, this.baseEvaluateData)
          : srcCurve._evaluate(srcTime, this.baseEvaluateData)
        : additive
        ? this._cureType._getZeroValue(this.baseEvaluateData.value)
        : this.defaultValue;

    const destValue =
      destCurve && destCurve.keys.length
        ? additive
          ? destCurve._evaluateAdditive(destTime, this.crossEvaluateData)
          : destCurve._evaluate(destTime, this.crossEvaluateData)
        : additive
        ? this._cureType._getZeroValue(this.crossEvaluateData.value)
        : this.defaultValue;

    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  crossFadeFromPoseAndApplyValue(
    destCurve: AnimationCurve<V>,
    destTime: number,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    const srcValue = additive
      ? this._cureType._subtractValue(this.fixedPoseValue, this.defaultValue, this.baseEvaluateData.value)
      : this.fixedPoseValue;
    const destValue =
      destCurve && destCurve.keys.length
        ? additive
          ? destCurve._evaluateAdditive(destTime, this.crossEvaluateData)
          : destCurve._evaluate(destTime, this.crossEvaluateData)
        : additive
        ? this._cureType._getZeroValue(this.crossEvaluateData.value)
        : this.defaultValue;

    this._applyCrossValue(srcValue, destValue, crossWeight, layerWeight, additive);
  }

  revertDefaultValue(): void {
    this._assembler.setTargetValue(this.defaultValue);
  }

  saveDefaultValue(): void {
    if (this._cureType._isReferenceType) {
      this._cureType._copyValue(this.referenceTargetValue, this.defaultValue);
    } else {
      this.defaultValue = this._assembler.getTargetValue();
    }
    this.hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    if (this._cureType._isReferenceType) {
      this._cureType._copyValue(this.referenceTargetValue, this.fixedPoseValue);
    } else {
      this.fixedPoseValue = this._assembler.getTargetValue();
    }
  }

  private _applyValue(value: V, weight: number): void {
    if (weight === 1.0) {
      if (this._cureType._isReferenceType) {
        this._cureType._copyValue(value, this.referenceTargetValue);
      } else {
        this._assembler.setTargetValue(value);
      }
    } else {
      if (this._cureType._isReferenceType) {
        const targetValue = this.referenceTargetValue;
        this._cureType._lerpValue(targetValue, value, weight, targetValue);
      } else {
        const originValue = this._assembler.getTargetValue();
        const lerpValue = this._cureType._lerpValue(originValue, value, weight);
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
    if (this._cureType._isReferenceType) {
      out = this.baseEvaluateData.value;
      this._cureType._lerpValue(srcValue, destValue, crossWeight, out);
    } else {
      out = this._cureType._lerpValue(srcValue, destValue, crossWeight);
    }

    if (additive) {
      if (this._cureType._isReferenceType) {
        this._cureType._additiveValue(out, layerWeight, this.referenceTargetValue);
      } else {
        const originValue = this._assembler.getTargetValue();
        const lerpValue = this._cureType._additiveValue(out, layerWeight, originValue);
        this._assembler.setTargetValue(lerpValue);
      }
    } else {
      this._applyValue(out, layerWeight);
    }
  }
}

type ComponentType = new (entity: Entity) => Component;
type AssemblerType = new () => IAnimationCurveOwnerAssembler<KeyframeValueType>;

export interface IEvaluateData<V extends KeyframeValueType> {
  curKeyframeIndex: number;
  value: V;
}
