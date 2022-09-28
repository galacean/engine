import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurve } from "../../AnimationCurve";
import { KeyFrameTangentType, KeyFrameValueType } from "../../KeyFrame";
import { IAnimationCurveOwnerAssembler } from "./Assembler/IAnimationCurveOwnerAssembler";
import { UniversalAnimationCurveOwnerAssembler } from "./Assembler/UniversalAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export abstract class AnimationCurveOwner<T extends KeyFrameTangentType, V extends KeyFrameValueType> {
  private static _assemblerMap = new Map<ComponentType, Record<string, AssemblerType>>();

  /**
   * @internal
   */
  static _registerAssemblerType(compomentType: ComponentType, property: string, assemblerType: AssemblerType): void {
    let subMap = AnimationCurveOwner._assemblerMap.get(compomentType);
    if (!subMap) {
      subMap = {};
      AnimationCurveOwner._assemblerMap.set(compomentType, subMap);
    }
    subMap[property] = assemblerType;
  }

  /**
   * @internal
   */
  static _getAssemblerType(compomentType: ComponentType, property: string): AssemblerType {
    const subMap = AnimationCurveOwner._assemblerMap.get(compomentType);
    return subMap ? subMap[property] : UniversalAnimationCurveOwnerAssembler<KeyFrameValueType>;
  }

  crossCurveMark: number = 0;
  crossCurveDataIndex: number;

  readonly target: Entity;
  readonly type: new (entity: Entity) => Component;
  readonly property: string;
  readonly component: Component;

  /** @internal */
  _defaultValue: V;
  /** @internal */
  _fixedPoseValue: V;
  /** @internal */
  _baseTempValue: V;
  /** @internal */
  _crossTempValue: V;

  protected _assembler: IAnimationCurveOwnerAssembler<V>;
  protected _hasSavedDefaultValue: boolean = false;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    this.target = target;
    this.type = type;
    this.property = property;
    this.component = target.getComponent(type);

    const assemblerType = AnimationCurveOwner._getAssemblerType(type, property);
    this._assembler = <IAnimationCurveOwnerAssembler<V>>new assemblerType();
    this._assembler.initialization(this);
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

type ComponentType = new (entity: Entity) => Component;
type AssemblerType = new () => IAnimationCurveOwnerAssembler<KeyFrameValueType>;
