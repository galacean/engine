import { Vector3 } from "@oasis-engine/math";
import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationProperty, AnimationPropertyInternal } from "../../enums/AnimationProperty";
import { AnimationCurveOwner } from "./AnimationCurveOwner";

/**
 * @internal
 */
export class AnimationVector3CurveOwner extends AnimationCurveOwner<Vector3, Vector3> {
  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
    this._defaultValue = new Vector3();
    this._fixedPoseValue = new Vector3();
    this._baseTempValue = new Vector3();
    this._crossTempValue = new Vector3();

    switch (property) {
      case AnimationPropertyInternal.Position:
        this._targetValue = target.transform.position;
        break;
      case AnimationPropertyInternal.Scale:
        this._targetValue = target.transform.scale;
        break;
      default:
        this._propertyReference = this._getPropertyReference();
        const { mounted, propertyName } = this._propertyReference;
        this._targetValue = mounted[propertyName];
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

    const { target, property } = this;
    switch (property) {
      case AnimationPropertyInternal.Position:
        target.transform.position = this._defaultValue;
        break;
      case AnimationPropertyInternal.Scale:
        target.transform.scale = this._defaultValue;
        break;
      default:
        const { mounted, propertyName } = this._propertyReference;
        mounted[propertyName] = this._defaultValue;
    }
  }

  protected _applyValue(value: Vector3, layerWeight: number): void {
    const { target, property } = this;
    switch (property) {
      case AnimationPropertyInternal.Position: {
        const { transform } = target;
        if (layerWeight === 1.0) {
          transform.position = value;
        } else {
          const position = transform.position;
          Vector3.lerp(position, value, layerWeight, position);
        }
        break;
      }
      case AnimationPropertyInternal.Scale: {
        const { transform } = target;
        if (layerWeight === 1.0) {
          transform.scale = value;
        } else {
          const scale = transform.scale;
          Vector3.lerp(scale, value, layerWeight, scale);
        }
        break;
      }
      default:
        const { mounted, propertyName } = this._propertyReference;
        if (layerWeight === 1.0) {
          mounted[propertyName] = value;
        } else {
          const originValue = mounted[propertyName];
          Vector3.lerp(originValue, value, layerWeight, originValue);
        }
        break;
    }
  }

  protected _applyAdditiveValue(value: Vector3, weight: number): void {
    const { target, property } = this;
    switch (property) {
      case AnimationPropertyInternal.Position: {
        const { transform } = target;
        const position = transform.position;
        position.x += value.x * weight;
        position.y += value.y * weight;
        position.z += value.z * weight;
        transform.position = position;
        break;
      }
      case AnimationPropertyInternal.Scale: {
        const { transform } = target;
        const scale = transform.scale;
        scale.x += value.x * weight;
        scale.y += value.y * weight;
        scale.z += value.z * weight;
        transform.scale = scale;
        break;
      }
      default:
        const { mounted, propertyName } = this._propertyReference;
        const originValue = mounted[propertyName];
        originValue.x += value.x * weight;
        originValue.y += value.y * weight;
        originValue.z += value.z * weight;
        mounted[propertyName] = originValue;
        break;
    }
  }

  protected _lerpValue(srcValue: Vector3, destValue: Vector3, crossWeight: number, out: Vector3): Vector3 {
    Vector3.lerp(srcValue, destValue, crossWeight, out);
    return out;
  }
}
