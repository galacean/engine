import { Component } from "../../../Component";
import { ComponentConstructor, Entity } from "../../../Entity";
import { AnimationCurve } from "../../animationCurve/AnimationCurve";
import { IAnimationCurveCalculator } from "../../animationCurve/interfaces/IAnimationCurveCalculator";
import { KeyframeValueType } from "../../Keyframe";
import { IAnimationCurveOwnerAssembler } from "./assembler/IAnimationCurveOwnerAssembler";
import { UniversalAnimationCurveOwnerAssembler } from "./assembler/UniversalAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class AnimationCurveOwner<V extends KeyframeValueType> {
  /** @internal */
  static _components: Component[] = [];

  private static _assemblerMap = new Map<ComponentConstructor, Record<string, AssemblerType>>();

  static registerAssembler(componentType: ComponentConstructor, property: string, assemblerType: AssemblerType): void {
    let subMap = AnimationCurveOwner._assemblerMap.get(componentType);
    if (!subMap) {
      subMap = {};
      AnimationCurveOwner._assemblerMap.set(componentType, subMap);
    }
    subMap[property] = assemblerType;
  }

  static getAssemblerType(componentType: ComponentConstructor, property: string): AssemblerType {
    const subMap = AnimationCurveOwner._assemblerMap.get(componentType);
    const assemblerType = subMap ? subMap[property] : undefined;
    return assemblerType ?? UniversalAnimationCurveOwnerAssembler;
  }

  readonly target: Entity;
  readonly property: string;
  readonly getProperty?: string;
  readonly component: Component;

  defaultValue: V;
  fixedPoseValue: V;
  baseEvaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null! };
  crossEvaluateData: IEvaluateData<V> = { curKeyframeIndex: 0, value: null! };
  cureType: IAnimationCurveCalculator<V>;
  updateMark: number = 0;

  private _assembler: IAnimationCurveOwnerAssembler<V>;
  private _writableTarget?: V;

  get referenceTargetValue(): V {
    return this._writableTarget ?? this._assembler.getTargetValue();
  }

  constructor(
    target: Entity,
    type: ComponentConstructor,
    component: Component,
    property: string,
    getProperty: string | undefined,
    cureType: IAnimationCurveCalculator<V>
  ) {
    this.target = target;
    this.property = property;
    this.getProperty = getProperty;
    this.component = component;
    this.cureType = cureType;

    const assemblerType = AnimationCurveOwner.getAssemblerType(type, property);
    this._assembler = <IAnimationCurveOwnerAssembler<V>>new assemblerType();
    this._assembler.initialize(this);

    if (cureType._isCopyMode) {
      const value = this._assembler.getTargetValue();
      if (!Object.isFrozen(value)) this._writableTarget = value;
    }
  }

  evaluateValue(curve: AnimationCurve<V>, time: number, additive: boolean): KeyframeValueType | undefined {
    return additive
      ? curve._evaluateAdditive(time, this.baseEvaluateData)
      : curve._evaluate(time, this.baseEvaluateData);
  }

  evaluateCrossFadeValue(
    srcCurve: AnimationCurve<V> | null | undefined,
    destCurve: AnimationCurve<V> | null | undefined,
    srcTime: number,
    destTime: number,
    crossWeight: number,
    additive: boolean
  ): KeyframeValueType {
    if (!this.cureType._supportInterpolationMode) {
      return this.evaluateValue(destCurve!, destTime, false)!;
    }

    const srcValue =
      srcCurve && srcCurve.keys.length
        ? additive
          ? srcCurve._evaluateAdditive(srcTime, this.baseEvaluateData)
          : srcCurve._evaluate(srcTime, this.baseEvaluateData)
        : additive
          ? this.cureType._getZeroValue!(this.baseEvaluateData.value)
          : this.defaultValue;

    const destValue =
      destCurve && destCurve.keys.length
        ? additive
          ? destCurve._evaluateAdditive(destTime, this.crossEvaluateData)
          : destCurve._evaluate(destTime, this.crossEvaluateData)
        : additive
          ? this.cureType._getZeroValue!(this.crossEvaluateData.value)
          : this.defaultValue;

    return this._lerpValue(srcValue!, destValue!, crossWeight);
  }

  crossFadeFromPoseAndApplyValue(
    destCurve: AnimationCurve<V> | null | undefined,
    destTime: number,
    crossWeight: number,
    additive: boolean
  ): KeyframeValueType {
    if (!this.cureType._supportInterpolationMode) {
      return this.evaluateValue(destCurve!, destTime, false)!;
    }

    const srcValue = additive
      ? this.cureType._subtractValue!(this.fixedPoseValue, this.defaultValue, this.baseEvaluateData.value)
      : this.fixedPoseValue;
    const destValue =
      destCurve && destCurve.keys.length
        ? additive
          ? destCurve._evaluateAdditive(destTime, this.crossEvaluateData)
          : destCurve._evaluate(destTime, this.crossEvaluateData)
        : additive
          ? this.cureType._getZeroValue!(this.crossEvaluateData.value)
          : this.defaultValue;

    return this._lerpValue(srcValue!, destValue!, crossWeight);
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
    this.defaultValue = this.cureType._setValue(this.referenceTargetValue, this.defaultValue);
  }

  saveFixedPoseValue(): void {
    this.fixedPoseValue = this.cureType._setValue(this.referenceTargetValue, this.fixedPoseValue);
  }

  applyValue(value: V, weight: number, additive: boolean): void {
    const { cureType, _assembler: assembler, _writableTarget: reference } = this;
    if (additive || weight !== 1) {
      const target = reference ?? cureType._setValue(assembler.getTargetValue(), this.crossEvaluateData.value);
      value = additive
        ? cureType._additiveValue!(value, weight, target)
        : cureType._lerpValue!(target, value, weight, target);
    } else if (reference) {
      cureType._setValue(value, reference);
    }
    if (!reference) {
      if (cureType._isCopyMode) {
        // A setter can retain or freeze its input. Keep evaluation buffers private.
        const sample = value as { clone(): KeyframeValueType } | { slice(): KeyframeValueType };
        value = ("clone" in sample ? sample.clone() : sample.slice()) as V;
      }
      assembler.setTargetValue(value);
    }
  }

  private _lerpValue(srcValue: V, destValue: V, crossWeight: number): KeyframeValueType {
    if (this.cureType._isCopyMode) {
      return this.cureType._lerpValue!(srcValue, destValue, crossWeight, this.baseEvaluateData.value);
    } else {
      this.baseEvaluateData.value = this.cureType._lerpValue!(srcValue, destValue, crossWeight);
      return this.baseEvaluateData.value;
    }
  }
}

type AssemblerType = new () => IAnimationCurveOwnerAssembler<KeyframeValueType>;

export interface IEvaluateData<V extends KeyframeValueType> {
  curKeyframeIndex: number;
  value: V;
}
