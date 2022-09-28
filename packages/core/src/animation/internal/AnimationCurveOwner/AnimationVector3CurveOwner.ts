import { Vector3 } from "@oasis-engine/math";
import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationProperty, AnimationPropertyInternal } from "../../enums/AnimationProperty";
import { AnimationCurveOwner } from "./AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./Assembler/IAnimationCurveOwnerAssembler";
import { PositionAnimationCurveOwnerAssembler } from "./Assembler/PositionAnimationCurveOwnerAssembler";
import { ScaleAnimationCurveOwnerAssembler } from "./Assembler/ScaleAnimationCurveOwnerAssembler";
import { UniversalAnimationCurveOwnerAssembler } from "./Assembler/UniversalAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class AnimationVector3CurveOwner extends AnimationCurveOwner<Vector3, Vector3> {
  private _assembler: IAnimationCurveOwnerAssembler<Vector3>;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    this._defaultValue = new Vector3();
    this._fixedPoseValue = new Vector3();
    this._baseTempValue = new Vector3();
    this._crossTempValue = new Vector3();

    switch (property) {
      case AnimationPropertyInternal.Position:
        this._targetValue = target.transform.position;
        this._assembler = new PositionAnimationCurveOwnerAssembler();
        break;
      case AnimationPropertyInternal.Scale:
        this._targetValue = target.transform.scale;
        this._assembler = new ScaleAnimationCurveOwnerAssembler();
        break;
      default:
        this._propertyReference = this._getPropertyReference();
        const { mounted, propertyName } = this._propertyReference;
        this._targetValue = mounted[propertyName];

        this._assembler = new UniversalAnimationCurveOwnerAssembler();
        break;
    }
  }

  saveDefaultValue(): void {
    this._defaultValue.copyFrom(this._targetValue);
    this._hasSavedDefaultValue = true;
  }

  saveFixedPoseValue(): void {
    this._fixedPoseValue.copyFrom(this._targetValue);
  }

  revertDefaultValue(): void {
    if (!this._hasSavedDefaultValue) return;

    this._assembler.setValue(this, this._defaultValue);
  }

  protected _applyValue(value: Vector3, layerWeight: number): void {
    if (layerWeight === 1.0) {
      this._assembler.setValue(this, value);
    } else {
      const value = this._assembler.getValue(this);
      Vector3.lerp(value, value, layerWeight, value);
    }
  }

  protected _applyAdditiveValue(value: Vector3, weight: number): void {
    const targetValue = this._assembler.getValue(this);
    targetValue.x += value.x * weight;
    targetValue.y += value.y * weight;
    targetValue.z += value.z * weight;
  }

  protected _lerpValue(srcValue: Vector3, destValue: Vector3, crossWeight: number, out: Vector3): Vector3 {
    Vector3.lerp(srcValue, destValue, crossWeight, out);
    return out;
  }
}
