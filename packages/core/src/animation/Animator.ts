import { InterpolableValueType } from "./AnimationConst";
import { InterpolableValue } from "./KeyFrame";
import { Transform } from "./../Transform";
import { AnimatorControllerLayer, AnimatorLayerBlendingMode } from "./AnimatorControllerLayer";
import { AnimatorController, AnimatorControllerParameter } from "./AnimatorController";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { ignoreClone, shallowClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { AnimationClip, AnimateProperty } from "./AnimationClip";
import { AnimationOptions, IChannelTarget } from "./types";
import { AnimatorUtils } from "./AnimatorUtils";
export class Animator extends Component {
  @ignoreClone
  private _animLayers: AnimatorControllerLayer[] = [];
  @ignoreClone
  private _timeScale: number = 1.0;

  private _channelStates: any[] = [];
  private _diffValueFromBasePos: Vector3;
  private _diffVector3FromBasePos: Vector3 = new Vector3();
  private _diffQuaternionFromBasePos: Vector3 = new Quaternion();

  /**
   * @param entity - The entitiy which the animation component belongs to.
   */
  constructor(entity: Entity) {
    super(entity);
  }

  /**
   * Be called when this instance be enabled.
   * @override
   * @internal
   */
  _onEnable(): void {
    this.engine._componentsManager.addOnUpdateAnimations(this);
  }

  /**
   * Be called when this instance be disabled or it's entity be inActiveInHierarchy or before this instance be destroyed.
   * @override
   * @internal
   */
  _onDisable(): void {
    this.engine._componentsManager.removeOnUpdateAnimations(this);
  }

  private _calculateDiff(
    valueType: InterpolableValueType,
    propertyName: string,
    dVal: InterpolableValue,
    sVal: InterpolableValue
  ) {
    switch (valueType) {
      case InterpolableValueType.Float:
        this._calculateFloatDiff(propertyName, dVal, sVal);
        break;
      case InterpolableValueType.Vector2:
        this._calculateVector2Diff(propertyName, dVal, sVal);
        break;
      case InterpolableValueType.Vector3:
        this._calculateVector3Diff(propertyName, dVal, sVal);
        break;
      case InterpolableValueType.Quaternion:
        this._calculateQuaternionDiff(dVal, sVal);
        break;
    }
  }
  private _calculateFloatDiff(propertyName: string, dVal: InterpolableValue, sVal: InterpolableValue) {}

  private _calculateVector2Diff(propertyName: string, dVal: InterpolableValue, sVal: InterpolableValue) {}
  private _calculateVector3Diff(propertyName: string, dVal: InterpolableValue, sVal: InterpolableValue) {
    if (AnimateProperty[propertyName] === AnimateProperty.scale) {
      this._diffVector3FromBasePos.x = dVal.x / sVal.x;
      this._diffVector3FromBasePos.y = dVal.y / sVal.y;
      this._diffVector3FromBasePos.z = dVal.z / sVal.z;
    } else {
      this._diffVector3FromBasePos.x = dVal.x - sVal.x;
      this._diffVector3FromBasePos.y = dVal.y - sVal.y;
      this._diffVector3FromBasePos.z = dVal.z - sVal.z;
    }
    this._diffValueFromBasePos = this._diffVector3FromBasePos;
  }
  private _calculateVector4Diff(propertyName: string, dVal: InterpolableValue, sVal: InterpolableValue) {}
  private _calculateQuaternionDiff(dVal: InterpolableValue, sVal: InterpolableValue) {
    Quaternion.conjugate(sVal, this._diffQuaternionFromBasePos);
    Quaternion.multiply(this._diffQuaternionFromBasePos, dVal, this._diffQuaternionFromBasePos);
    this._diffValueFromBasePos = this._diffQuaternionFromBasePos;
  }

  private _updateLayerValue(target: Entity, propertyName: string, val: InterpolableValue, weight: number) {
    const transform = (<Entity>target).transform;
    switch (AnimateProperty[propertyName]) {
      case AnimateProperty.position:
        const position = transform.position;
        Vector3.lerp(transform.position, val, weight, position);
        transform.position = position;
        break;
      case AnimateProperty.rotation:
        const rotationQuaternion = transform.rotationQuaternion;
        Quaternion.slerp(transform.rotationQuaternion, val, weight, rotationQuaternion);
        transform.rotationQuaternion = rotationQuaternion;
        break;
      case AnimateProperty.scale: {
        const scale = transform.scale;
        Vector3.lerp(transform.scale, val, weight, scale);
        transform.scale = scale;
        break;
      }
    }
  }

  private _updateAdditiveLayerValue(target: Entity, propertyName: string, diffVal: InterpolableValue, weight: number) {
    const transform = (<Entity>target).transform;
    switch (AnimateProperty[propertyName]) {
      case AnimateProperty.position:
        const position = transform.position;
        diffVal.scale(weight);
        position.x += diffVal.x;
        position.y += diffVal.y;
        position.z += diffVal.z;
        transform.position = position;
        break;
      case AnimateProperty.rotation:
        const rotationQuaternion = transform.rotationQuaternion;
        AnimatorUtils.calQuaternionWeight(diffVal, weight, diffVal);
        diffVal.normalize();
        rotationQuaternion.multiply(diffVal);
        transform.rotationQuaternion = rotationQuaternion;
        break;
      case AnimateProperty.scale: {
        const scale = transform.scale;
        AnimatorUtils.calScaleWeight(scale, weight, scale);
        scale.x = scale.x * diffVal.x;
        scale.y = scale.y * diffVal.y;
        scale.z = scale.z * diffVal.z;
        transform.scale = scale;
        break;
      }
      default:
        target[propertyName] = diffVal;
    }
  }

  /**
   * Evaluates the animation component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update.
   * @private
   */
  public update(deltaTime: number) {
    const { animatorController } = this;
    if (!animatorController) return;
    const { layers } = animatorController;
    for (let i = 0; i < layers.length; i++) {
      const isFirstLayer = i === 0;
      let weight = i === 1 ? 1 : 1;
      const animLayer = layers[i];
      const { blendingMode } = animLayer;
      const animClip = animLayer.stateMachine.states[i === 1 ? 1 : i].motion as AnimationClip;
      const count = animClip.curves.length;
      this._channelStates[i] = this._channelStates[i] || [];
      for (let j = count - 1; j >= 0; j--) {
        const { curve, propertyName, relativePath, type } = animClip.curves[j];
        const animClipLength = curve.length;
        const target = this.entity.findByName(relativePath);
        this._channelStates[i][j] = this._channelStates[i][j] || {
          frameTime: 0.0
        };
        this._channelStates[i][j].frameTime += deltaTime / 1000;
        if (this._channelStates[i][j].frameTime > animClipLength) {
          this._channelStates[i][j].frameTime = this._channelStates[i][j].frameTime % animClipLength;
        }
        const val = curve.evaluate(this._channelStates[i][j].frameTime);
        const { valueType, firstFrameValue } = curve;
        if (type === Transform) {
          if (isFirstLayer) {
            this._updateLayerValue(target, propertyName, val, weight);
          } else {
            if (blendingMode === AnimatorLayerBlendingMode.Additive) {
            } else {
              this._calculateDiff(valueType, propertyName, val, firstFrameValue);
              this._updateAdditiveLayerValue(target, propertyName, this._diffValueFromBasePos, weight);
            }
          }
        }
      }
    }
  }

  /**
   * CrossFade to the AnimationClip by name.
   * @param name - The AnimatioinClip's name.
   * @param crossFadeDuration - The milliseconds of the crossFade's duration.
   * @param options - The play options when playing AnimationClip.
   */
  public CrossFade(
    name: string,
    normalizedTransitionDuration: number,
    normalizedTimeOffset: number,
    normalizedTransitionTime: number
  ) {}

  /**
   * Update animation value.
   * @private
   */
  public _updateValues() {
    if (this._animLayers.length === 0 || !this._channelStates) {
      return;
    }

    for (let i = this._channelStates.length - 1; i >= 0; i--) {
      const channelTarget = this._channelStates[i];
      const { target, pathType, currentValue } = channelTarget;
      //   const targetObject = channelTarget.targetObject;
      //   const path = channelTarget.path;

      //CM: Temporary optimization val should be Vector3/Quaternion type to avoid conversion overhead
      //CM: In the future, after Animation unifies all animation systems, it will use pathType as other and continue to use reflection.
      //CM: Due to the relatively small number of pathTypes, pre-classification can be used to avoid switch overhead in the future, such as three types of skeletal animation
      const transform = (<Entity>target).transform;
      switch (pathType) {
        case AnimateProperty.position:
          transform.position = currentValue;
          break;
        case AnimateProperty.rotation:
          transform.rotationQuaternion = currentValue;
          break;
        case AnimateProperty.scale:
          transform.scale = currentValue;
          break;
      }
    }
  }

  animatorController: AnimatorController;
  layers: AnimatorControllerLayer[];
  parameters: AnimatorControllerParameter[];

  play() {}

  public stopPlayback(rightnow: boolean) {
    // for (let i = this._animLayers.length - 1; i >= 0; i--) {
    //   if (this._animLayers[i].isFading) {
    //     this._animLayers.splice(i, 1);
    //   } else {
    //     this._animLayers[i].stop(rightnow);
    //   }
    // }
  }

  /**
   * Jump to a frame of the animation, take effect immediately.
   * @param frameTime - The time which the animation will jump to.
   */
  public jumpToFrame(frameTime: number) {
    // frameTime = frameTime / 1000;
    // for (let i = this._animLayers.length - 1; i >= 0; i--) {
    //   this._animLayers[i].jumpToFrame(frameTime);
    // }
    // this._updateValues();
  }

  crossFade() {}

  getLayerByName() {}
  getLayerByIndex() {}
}
