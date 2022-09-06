import { Vector3 } from "@oasis-engine/math";
import { AnimationCurveOwner, PropertyReference } from "./AnimationCurveOwner";
import { Component } from "../../../Component";
import { Entity } from "../../../Entity";
import { AnimationProperty, AnimationPropertyInternal } from "../../enums/AnimationProperty";

/**
 * @internal
 */
export class AnimationVector3CurveOwner extends AnimationCurveOwner {
  protected _defaultValue = new Vector3();
  protected _fixedPoseValue = new Vector3();
  protected _propertyReference: PropertyReference;
  protected _baseTempValue = new Vector3();
  protected _crossTempValue = new Vector3();

  private _targetValue: Vector3;

  constructor(target: Entity, type: new (entity: Entity) => Component, property: AnimationProperty) {
    super(target, type, property);
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
        this._targetValue = mounted[propertyName] as Vector3;
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

  protected _applyValue(value: Vector3, layerWeight: number) {
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
          const originValue = mounted[propertyName] as Vector3;
          Vector3.lerp(originValue, value, layerWeight, originValue);
        }
        break;
    }
  }

  protected _applyAdditiveVale(value: Vector3, weight: number) {
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
        const originValue = mounted[propertyName] as Vector3;
        originValue.x += value.x * weight;
        originValue.y += value.y * weight;
        originValue.z += value.z * weight;
        mounted[propertyName] = originValue;
        break;
    }
  }

  protected _applyCrossValue(
    srcValue: Vector3,
    destValue: Vector3,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ) {
    const value = this._baseTempValue;
    Vector3.lerp(srcValue, destValue, crossWeight, value);
    if (additive) {
      this._applyAdditiveVale(value, layerWeight);
    } else {
      this._applyValue(value, layerWeight);
    }
  }
}
