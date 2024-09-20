import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurve } from "../../animationCurve/AnimationCurve";
import { IAnimationCurveCalculator } from "../../animationCurve/interfaces/IAnimationCurveCalculator";
import { KeyframeValueType } from "../../Keyframe";
import { AnimationPropertyReferenceManager } from "../AnimationPropertyReferenceManager";
import { IAnimationCurveOwnerAssembler } from "./assembler/IAnimationCurveOwnerAssembler";
import { UniversalAnimationCurveOwnerAssembler } from "./assembler/UniversalAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class AnimationCurveOwner<V extends KeyframeValueType> {
  /** @internal */
  static _components: Component[] = [];

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
    return assemblerType ?? UniversalAnimationCurveOwnerAssembler;
  }

  readonly target: Entity;
  readonly property: string;
  readonly getProperty?: string;
  readonly component: Component;
  readonly referenceManager: AnimationPropertyReferenceManager;

  defaultValue: V;
  fixedPoseValue: V;
  baseEvaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null };
  crossEvaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null };
  cureType: IAnimationCurveCalculator<V>;
  updateMark: number = 0;

  /** @internal */
  _assembler: IAnimationCurveOwnerAssembler<V>;

  constructor(
    referenceManager: AnimationPropertyReferenceManager,
    target: Entity,
    type: new (entity: Entity) => Component,
    component: Component,
    property: string,
    getProperty: string,
    cureType: IAnimationCurveCalculator<V>
  ) {
    this.referenceManager = referenceManager;
    this.target = target;
    this.property = property;
    this.getProperty = getProperty;
    this.component = component;
    this.cureType = cureType;

    const assemblerType = AnimationCurveOwner.getAssemblerType(type, property);
    this._assembler = <IAnimationCurveOwnerAssembler<V>>new assemblerType();
    this._assembler.initialize(this);
  }

  evaluateValue(curve: AnimationCurve<V>, time: number, additive: boolean): KeyframeValueType {
    return additive
      ? curve._evaluateAdditive(time, this.baseEvaluateData)
      : curve._evaluate(time, this.baseEvaluateData);
  }

  evaluateCrossFadeValue(
    srcCurve: AnimationCurve<V>,
    destCurve: AnimationCurve<V>,
    srcTime: number,
    destTime: number,
    crossWeight: number,
    additive: boolean
  ): KeyframeValueType {
    if (!this.cureType._supportInterpolationMode) {
      return this.evaluateValue(destCurve, destTime, false);
    }

    const srcValue =
      srcCurve && srcCurve.keys.length
        ? additive
          ? srcCurve._evaluateAdditive(srcTime, this.baseEvaluateData)
          : srcCurve._evaluate(srcTime, this.baseEvaluateData)
        : additive
        ? this.cureType._getZeroValue(this.baseEvaluateData.value)
        : this.defaultValue;

    const destValue =
      destCurve && destCurve.keys.length
        ? additive
          ? destCurve._evaluateAdditive(destTime, this.crossEvaluateData)
          : destCurve._evaluate(destTime, this.crossEvaluateData)
        : additive
        ? this.cureType._getZeroValue(this.crossEvaluateData.value)
        : this.defaultValue;

    return this._lerpValue(srcValue, destValue, crossWeight);
  }

  crossFadeFromPoseAndApplyValue(
    destCurve: AnimationCurve<V>,
    destTime: number,
    crossWeight: number,
    additive: boolean
  ): KeyframeValueType {
    if (!this.cureType._supportInterpolationMode) {
      return this.evaluateValue(destCurve, destTime, false);
    }

    const srcValue = additive
      ? this.cureType._subtractValue(this.fixedPoseValue, this.defaultValue, this.baseEvaluateData.value)
      : this.fixedPoseValue;
    const destValue =
      destCurve && destCurve.keys.length
        ? additive
          ? destCurve._evaluateAdditive(destTime, this.crossEvaluateData)
          : destCurve._evaluate(destTime, this.crossEvaluateData)
        : additive
        ? this.cureType._getZeroValue(this.crossEvaluateData.value)
        : this.defaultValue;

    return this._lerpValue(srcValue, destValue, crossWeight);
  }

  revertDefaultValue(): void {
    this._assembler.setTargetValue(this.defaultValue);
  }

  getEvaluateValue(out: V): V {
    if (this.cureType._isCopyMode) {
      this.cureType._setValue(this.baseEvaluateData.value, out);
      return out;
    } else {
      return this.baseEvaluateData.value;
    }
  }

  saveDefaultValue(): void {
    if (this.cureType._isCopyMode) {
      this.cureType._setValue(this._assembler.getTargetValue(), this.defaultValue);
    } else {
      this.defaultValue = this._assembler.getTargetValue();
    }
  }

  saveFixedPoseValue(): void {
    if (this.cureType._isCopyMode) {
      this.cureType._setValue(this._assembler.getTargetValue(), this.fixedPoseValue);
    } else {
      this.fixedPoseValue = this._assembler.getTargetValue();
    }
  }

  applyValue(value: V, weight: number, additive: boolean): void {
    const cureType = this.cureType;
    const referenceTargetValue = cureType._isCopyMode ? this._assembler.getTargetValue() : null;

    if (additive) {
      const assembler = this._assembler;

      if (cureType._isCopyMode) {
        cureType._additiveValue(value, weight, referenceTargetValue);
      } else {
        const originValue = assembler.getTargetValue();
        const additiveValue = cureType._additiveValue(value, weight, originValue);
        assembler.setTargetValue(additiveValue);
      }
    } else {
      if (weight === 1.0) {
        if (cureType._isCopyMode) {
          cureType._setValue(value, referenceTargetValue);
        } else {
          this._assembler.setTargetValue(value);
        }
      } else {
        if (cureType._isCopyMode) {
          cureType._lerpValue(referenceTargetValue, value, weight, referenceTargetValue);
        } else {
          const originValue = this._assembler.getTargetValue();
          const lerpValue = cureType._lerpValue(originValue, value, weight);
          this._assembler.setTargetValue(lerpValue);
        }
      }
    }
  }

  private _lerpValue(srcValue: V, destValue: V, crossWeight: number): KeyframeValueType {
    if (this.cureType._isCopyMode) {
      return this.cureType._lerpValue(srcValue, destValue, crossWeight, this.baseEvaluateData.value);
    } else {
      this.baseEvaluateData.value = this.cureType._lerpValue(srcValue, destValue, crossWeight);
      return this.baseEvaluateData.value;
    }
  }
}

type ComponentType = new (entity: Entity) => Component;
type AssemblerType = new () => IAnimationCurveOwnerAssembler<KeyframeValueType>;

export interface IEvaluateData<V extends KeyframeValueType> {
  curKeyframeIndex: number;
  value: V;
}
