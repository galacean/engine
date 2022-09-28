import { Quaternion } from "@oasis-engine/math";
import { Vector4 } from "@oasis-engine/math/src";
import { Component } from "../../../Component";
import { AnimationProperty, AnimationPropertyInternal } from "../../enums/AnimationProperty";
import { Entity } from "./../../../Entity";
import { AnimatorUtils } from "./../../AnimatorUtils";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./Assembler/IAnimationCurveOwnerAssembler";
import { RotationAnimationCurveOwnerAssembler } from "./Assembler/RotationAnimationCurveOwnerAssembler";
import { UniversalAnimationCurveOwnerAssembler } from "./Assembler/UniversalAnimationCurveOwnerAssembler";
/**
 * @internal
 */
export class AnimationQuaternionCurveOwner extends AnimationCurveOwner<Vector4, Quaternion> {
  private _assembler: IAnimationCurveOwnerAssembler<Quaternion>;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);

    this._defaultValue = new Quaternion();
    this._fixedPoseValue = new Quaternion();
    this._baseTempValue = new Quaternion();
    this._crossTempValue = new Quaternion();

    switch (property) {
      case AnimationPropertyInternal.Rotation:
        this._targetValue = target.transform.rotationQuaternion;
        this._assembler = new RotationAnimationCurveOwnerAssembler();
        break;
      default:
        this._propertyReference = this._getPropertyReference();
        const { mounted, propertyName } = this._propertyReference;
        this._targetValue = mounted[propertyName];
        this._assembler = new UniversalAnimationCurveOwnerAssembler();
        break;
    }
  }

  saveDefaultValue() {
    this._defaultValue.copyFrom(this._targetValue);
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue() {
    this._fixedPoseValue.copyFrom(this._targetValue);
  }

  revertDefaultValue() {
    if (!this._hasSavedDefaultValue) return;

    this._assembler.setValue(this, this._defaultValue);
  }

  protected _applyValue(value: Quaternion, weight: number) {
    if (weight === 1.0) {
      this._assembler.setValue(this, value);
    } else {
      const targetValue = this._assembler.getValue(this);
      Quaternion.slerp(targetValue, value, weight, targetValue);
    }
  }

  protected _applyAdditiveValue(value: Quaternion, weight: number) {
    const targetValue = this._assembler.getValue(this);
    AnimatorUtils.quaternionWeight(value, weight, value);
    value.normalize();
    targetValue.multiply(value);
  }

  protected _lerpValue(srcValue: Quaternion, destValue: Quaternion, crossWeight: number, out: Quaternion): Quaternion {
    Quaternion.slerp(srcValue, destValue, crossWeight, out);
    return out;
  }
}
