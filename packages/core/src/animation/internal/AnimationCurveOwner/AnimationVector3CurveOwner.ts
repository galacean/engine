import { Vector3 } from "@oasis-engine/math";
import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationCurveOwner } from "./AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationVector3CurveOwner extends AnimationCurveOwner<Vector3, Vector3> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: string) {
    super(target, type, property);
    this._defaultValue = new Vector3();
    this._fixedPoseValue = new Vector3();
    this._baseTempValue = new Vector3();
    this._crossTempValue = new Vector3();
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

    this._assembler.setValue(this._defaultValue);
  }

  protected _applyValue(value: Vector3, layerWeight: number): void {
    if (layerWeight === 1.0) {
      this._assembler.setValue(value);
    } else {
      const originValue = this._assembler.getValue();
      Vector3.lerp(originValue, value, layerWeight, originValue);
    }
  }

  protected _applyAdditiveValue(value: Vector3, weight: number): void {
    const targetValue = this._assembler.getValue();
    targetValue.x += value.x * weight;
    targetValue.y += value.y * weight;
    targetValue.z += value.z * weight;
  }

  protected _lerpValue(srcValue: Vector3, destValue: Vector3, crossWeight: number, out: Vector3): Vector3 {
    Vector3.lerp(srcValue, destValue, crossWeight, out);
    return out;
  }
}
