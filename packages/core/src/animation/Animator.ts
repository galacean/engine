import { Transform } from "./../Transform";
import { AnimatorState } from "./AnimatorState";
import { InterpolableValueType } from "./enums/InterpolableValueType";
import { InterpolableValue } from "./KeyFrame";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { AnimatorController } from "./AnimatorController";
import { Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { AnimatorUtils } from "./AnimatorUtils";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { PlayType } from "./enums/PlayType";

/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  /** The playback speed of the Animator, 1.0 is normal playback speed. */
  speed: number = 1.0;

  private _animatorController: AnimatorController;
  private _diffValueFromBasePos: InterpolableValue;
  private _diffFloatFromBasePos: number = 0;
  private _diffVector2FromBasePos: Vector2 = new Vector2();
  private _diffVector3FromBasePos: Vector3 = new Vector3();
  private _diffVector4FromBasePos: Vector4 = new Vector4();
  private _diffQuaternionFromBasePos: Quaternion = new Quaternion();
  private _tempVector3: Vector3 = new Vector3();
  private _tempQuaternion: Quaternion = new Quaternion();

  /**
   * AnimatorController that controls the Animator.
   */
  get animatorController(): AnimatorController {
    return this._animatorController;
  }

  set animatorController(animatorController: AnimatorController) {
    this._animatorController = animatorController;
    if (!animatorController) return;
    animatorController._setTarget(this.entity);
  }

  /**
   * Get all layers from the AnimatorController which belongs this Animator .
   */
  get layers(): Readonly<AnimatorControllerLayer[]> {
    return this._animatorController?.layers || [];
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
  }

  /**
   * Plays a state by name.
   * @param stateName - The state name
   * @param layerIndex - The layer index(default 0)
   * @param normalizedTimeOffset - The time offset between 0 and 1(default 0)
   */
  play(stateName: string, layerIndex: number = 0, normalizedTimeOffset: number = 0): AnimatorState {
    const { animatorController } = this;
    if (!animatorController) return;
    const animLayer = animatorController.layers[layerIndex];
    const theState = animLayer.stateMachine.findStateByName(stateName);
    theState.frameTime = theState.clip.length * normalizedTimeOffset;
    animLayer._playingState = theState;
    return theState;
  }

  /**
   * Evaluates the animator component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update
   */
  update(deltaTime: number): void {
    if (this.speed === 0) return;
    deltaTime *= this.speed;
    const { animatorController } = this;
    if (!animatorController) return;
    const { layers } = animatorController;
    for (let i = 0; i < layers.length; i++) {
      const isFirstLayer = i === 0;
      const animLayer = layers[i];
      if (!animLayer._playingState) {
        animLayer._playingState = animLayer.stateMachine.states[0];
      }
      const currentState = animLayer._playingState;
      currentState.frameTime += deltaTime / 1000;
      if (currentState._playType === PlayType.IsFading) {
        const fadingState = animLayer._fadingState;
        if (fadingState) {
          fadingState.frameTime += deltaTime / 1000;
          if (fadingState.frameTime > fadingState.clipEndTime) {
            fadingState.frameTime = fadingState.clipEndTime;
          }
        }
      }
      this._updatePlayingState(currentState, animLayer, isFirstLayer, deltaTime);
    }
  }

  /**
   * crossFade to the AnimationClip by name.
   * @param name - The name of the next state
   * @param layerIndex - The layer where the crossfade occurs
   * @param normalizedTransitionDuration - The duration of the transition (normalized)
   * @param normalizedTimeOffset - The time of the next state (normalized)
   */
  crossFade(
    name: string,
    layerIndex: number,
    normalizedTransitionDuration: number,
    normalizedTimeOffset: number
  ): void {
    const animLayer = this.animatorController.layers[layerIndex];
    const currentState = animLayer._playingState;
    if (currentState) {
      currentState._playType = PlayType.IsFading;
      const nextState = animLayer.stateMachine.findStateByName(name);
      if (nextState) {
        const transition = currentState.addTransition(nextState);
        this.animatorController.layers[layerIndex]._fadingState = nextState;
        transition.duration = currentState.clip.length * normalizedTransitionDuration;
        transition.offset = nextState.clip.length * normalizedTimeOffset;
        transition.exitTime = currentState.frameTime;
      }
    }
  }

  /**
   * Return the layer by name.
   * @param name - The layer name
   */
  getLayerByName(name: string): AnimatorControllerLayer {
    return AnimatorControllerLayer.findLayerByName(name);
  }

  /**
   * @override
   * @internal
   */
  _onEnable(): void {
    this.engine._componentsManager.addOnUpdateAnimations(this);
  }

  /**
   * @override
   * @internal
   */
  _onDisable(): void {
    this.engine._componentsManager.removeOnUpdateAnimations(this);
  }

  private _calculateDiff(
    valueType: InterpolableValueType,
    propertyName: string,
    sVal: InterpolableValue,
    dVal: InterpolableValue
  ): void {
    switch (valueType) {
      case InterpolableValueType.Float:
        this._calculateFloatDiff(propertyName, sVal as number, dVal as number);
        break;
      case InterpolableValueType.Vector2:
        this._calculateVector2Diff(propertyName, sVal as Vector2, dVal as Vector2);
        break;
      case InterpolableValueType.Vector3:
        this._calculateVector3Diff(propertyName, sVal as Vector3, dVal as Vector3);
        break;
      case InterpolableValueType.Vector3:
        this._calculateVector4Diff(propertyName, sVal as Vector4, dVal as Vector4);
        break;
      case InterpolableValueType.Quaternion:
        this._calculateQuaternionDiff(dVal as Quaternion, sVal as Quaternion);
        break;
    }
  }

  private _calculateFloatDiff(propertyName: string, sVal: number, dVal: number): void {
    if (propertyName === "scale") {
      this._diffFloatFromBasePos = dVal / sVal;
    } else {
      this._diffFloatFromBasePos = dVal - sVal;
    }
    this._diffValueFromBasePos = this._diffFloatFromBasePos;
  }

  private _calculateVector2Diff(propertyName: string, sVal: Vector2, dVal: Vector2): void {
    if (propertyName === "scale") {
      this._diffVector2FromBasePos.x = dVal.x / sVal.x;
      this._diffVector2FromBasePos.y = dVal.y / sVal.y;
    } else {
      this._diffVector2FromBasePos.x = dVal.x - sVal.x;
      this._diffVector2FromBasePos.y = dVal.y - sVal.y;
    }
    this._diffValueFromBasePos = this._diffVector2FromBasePos;
  }

  private _calculateVector3Diff(propertyName: string, sVal: Vector3, dVal: Vector3): void {
    if (propertyName === "scale") {
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

  private _calculateVector4Diff(propertyName: string, sVal: Vector4, dVal: Vector4): void {
    if (propertyName === "scale") {
      this._diffVector4FromBasePos.x = dVal.x / sVal.x;
      this._diffVector4FromBasePos.y = dVal.y / sVal.y;
      this._diffVector4FromBasePos.z = dVal.z / sVal.z;
      this._diffVector4FromBasePos.w = dVal.w / sVal.w;
    } else {
      this._diffVector4FromBasePos.x = dVal.x - sVal.x;
      this._diffVector4FromBasePos.y = dVal.y - sVal.y;
      this._diffVector4FromBasePos.z = dVal.z - sVal.z;
      this._diffVector4FromBasePos.w = dVal.w - sVal.w;
    }
    this._diffValueFromBasePos = this._diffVector4FromBasePos;
  }

  private _calculateQuaternionDiff(dVal: Quaternion, sVal: Quaternion): void {
    Quaternion.conjugate(sVal, this._diffQuaternionFromBasePos);
    Quaternion.multiply(this._diffQuaternionFromBasePos, dVal, this._diffQuaternionFromBasePos);
    this._diffValueFromBasePos = this._diffQuaternionFromBasePos;
  }

  private _getCrossFadeValue(
    target: Entity,
    type: new (entity: Entity) => Component,
    propertyName: string,
    sVal: InterpolableValue,
    dVal: InterpolableValue,
    crossWeight: number
  ): InterpolableValue {
    const transform = target.transform;
    if (type === Transform) {
      switch (propertyName) {
        case "position":
          Vector3.lerp(sVal as Vector3, dVal as Vector3, crossWeight, this._tempVector3);
          return this._tempVector3;
        case "rotation":
          Quaternion.slerp(sVal as Quaternion, dVal as Quaternion, crossWeight, this._tempQuaternion);
          return this._tempQuaternion;
        case "scale": {
          const scale = transform.scale;
          Vector3.lerp(sVal as Vector3, dVal as Vector3, crossWeight, this._tempVector3);
          transform.scale = scale;
          return this._tempVector3;
        }
      }
    }
  }

  private _updateLayerValue(
    target: Entity,
    type: new (entity: Entity) => Component,
    propertyName: string,
    sVal: InterpolableValue,
    dVal: InterpolableValue,
    weight: number
  ): void {
    const transform = target.transform;
    if (type === Transform) {
      switch (propertyName) {
        case "position":
          const position = transform.position;
          Vector3.lerp(sVal as Vector3, dVal as Vector3, weight, position);
          transform.position = position as Vector3;
          break;
        case "rotation":
          const rotationQuaternion = transform.rotationQuaternion;
          Quaternion.slerp(sVal as Quaternion, dVal as Quaternion, weight, rotationQuaternion);
          transform.rotationQuaternion = rotationQuaternion;
          break;
        case "scale": {
          const scale = transform.scale;
          Vector3.lerp(sVal as Vector3, dVal as Vector3, weight, scale);
          transform.scale = scale;
          break;
        }
      }
    }
  }

  private _updateAdditiveLayerValue(
    target: Entity,
    type: new (entity: Entity) => Component,
    propertyName: string,
    diffVal: InterpolableValue,
    weight: number
  ): void {
    const transform = (<Entity>target).transform;
    if (type === Transform) {
      switch (propertyName) {
        case "position":
          if (diffVal instanceof Vector3) {
            const position = transform.position;
            position.x += diffVal.x;
            position.y += diffVal.y;
            position.z += diffVal.z;
            transform.position = position;
          }
          break;
        case "rotation":
          if (diffVal instanceof Quaternion) {
            const rotationQuaternion = transform.rotationQuaternion;
            AnimatorUtils.calQuaternionWeight(diffVal, weight, diffVal);
            diffVal.normalize();
            rotationQuaternion.multiply(diffVal);
            transform.rotationQuaternion = rotationQuaternion;
          }
          break;
        case "scale": {
          if (diffVal instanceof Vector3) {
            const scale = transform.scale;
            AnimatorUtils.calScaleWeight(scale, weight, scale);
            scale.x = scale.x * diffVal.x;
            scale.y = scale.y * diffVal.y;
            scale.z = scale.z * diffVal.z;
            transform.scale = scale;
          }
          break;
        }
        default:
          target[propertyName] += diffVal;
      }
    }
  }

  private _updatePlayingState(
    currentState: AnimatorState,
    animLayer: AnimatorControllerLayer,
    isFirstLayer: boolean,
    deltaTime: number
  ): void {
    const { weight, blendingMode } = animLayer;
    if (currentState._playType === PlayType.IsFading) {
      const transition = currentState.transitions[0];
      const destinationState = transition.destinationState;
      if (transition) {
        let clip = currentState.clip;
        transition._crossFadeFrameTime += deltaTime / 1000;
        let crossWeight: number;
        if (transition.duration > clip.length - transition.exitTime) {
          crossWeight = transition._crossFadeFrameTime / (clip.length - transition.exitTime);
        } else {
          crossWeight = transition._crossFadeFrameTime / transition.duration;
        }
        if (crossWeight >= 1) {
          crossWeight = 1;
          currentState._playType = PlayType.IsFinish;
        }
        let count = clip._curves.length;
        const relativePathList: string[] = [];
        const typeList: (new (entity: Entity) => Component)[] = [];
        const propertyNameList: string[] = [];
        const relativePathPropertyNameMap: { [key: string]: number } = {};
        const targetPropertyNameValues = [];
        const targetDefaultValues = [];
        const targetList = [];
        for (let i = count - 1; i >= 0; i--) {
          const { curve, type, propertyName, relativePath, _defaultValue, _target } = clip._curves[i];
          if (!relativePathPropertyNameMap[`${relativePath}_${propertyName}`]) {
            const frameTime = currentState._getTheRealFrameTime();
            relativePathPropertyNameMap[`${relativePath}_${propertyName}`] = relativePathList.length;
            relativePathList.push(relativePath);
            typeList.push(type);
            propertyNameList.push(propertyName);
            const val = curve.evaluate(frameTime);
            targetPropertyNameValues.push([val]);
            targetDefaultValues.push([_defaultValue]);
            targetList.push([_target]);
          }
        }
        clip = destinationState.clip;
        count = clip._curves.length;
        for (let i = count - 1; i >= 0; i--) {
          const { curve, type, propertyName, relativePath, _defaultValue, _target } = clip._curves[i];
          if (relativePathPropertyNameMap[`${relativePath}_${propertyName}`] >= 0) {
            const index = relativePathPropertyNameMap[`${relativePath}_${propertyName}`];
            const val = curve.evaluate(transition.offset + transition._crossFadeFrameTime);
            targetPropertyNameValues[index][1] = val;
            targetDefaultValues[index][1] = _defaultValue;
          } else {
            relativePathPropertyNameMap[`${relativePath}_${propertyName}`] = relativePathList.length;
            relativePathList.push(relativePath);
            typeList.push(type);
            propertyNameList.push(propertyName);
            const val = curve.evaluate(transition.offset + transition._crossFadeFrameTime);
            targetPropertyNameValues.push([null, val]);
            targetDefaultValues.push([null, _defaultValue]);
            targetList.push([null, _target]);
          }
        }
        count = relativePathList.length;
        for (let i = count - 1; i >= 0; i--) {
          const relativePath = relativePathList[i];
          const propertyName = propertyNameList[i];
          const index = relativePathPropertyNameMap[`${relativePath}_${propertyName}`];
          const vals = targetPropertyNameValues[index];
          const defaultValues = targetDefaultValues[index];
          const targets = targetList[index];
          const type = typeList[index];

          let calculatedValue: InterpolableValue;
          if (vals[0] && vals[1]) {
            calculatedValue = this._getCrossFadeValue(targets[0], type, propertyName, vals[0], vals[1], crossWeight);
            this._updateLayerValue(targets[0], type, propertyName, defaultValues[0], calculatedValue, weight);
          } else if (vals[0]) {
            calculatedValue = this._getCrossFadeValue(
              targets[0],
              type,
              propertyName,
              defaultValues[0],
              vals[0],
              1 - crossWeight
            );
            this._updateLayerValue(targets[0], type, propertyName, defaultValues[0], calculatedValue, weight);
          } else {
            calculatedValue = this._getCrossFadeValue(
              targets[1],
              type,
              propertyName,
              defaultValues[1],
              vals[1],
              crossWeight
            );
            this._updateLayerValue(targets[1], type, propertyName, defaultValues[1], calculatedValue, weight);
          }
        }
        if (currentState._playType === PlayType.IsFinish) {
          animLayer._playingState = destinationState;
        }
      }
    } else {
      currentState._playType = PlayType.IsPlaying;
      const clip = currentState.clip;
      const count = clip._curves.length;
      for (let j = count - 1; j >= 0; j--) {
        const { curve, type, propertyName, _target, _defaultValue } = clip._curves[j];
        const frameTime = currentState._getTheRealFrameTime();
        const val = curve.evaluate(frameTime);
        const { _valueType, _firstFrameValue } = curve;
        if (isFirstLayer) {
          this._updateLayerValue(_target, type, propertyName, _defaultValue, val, 1);
        } else {
          if (blendingMode === AnimatorLayerBlendingMode.Additive) {
            this._calculateDiff(_valueType, propertyName, _firstFrameValue, val);
            this._updateAdditiveLayerValue(_target, type, propertyName, this._diffValueFromBasePos, weight);
          } else {
            this._updateLayerValue(_target, type, propertyName, _defaultValue, val, weight);
          }
        }
      }
    }
  }
}
