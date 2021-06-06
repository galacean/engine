import { AnimatorStateTransition } from "./AnimatorTransition";
import { WrapMode } from "./enums/WrapMode";
import { Transform } from "../Transform";
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
import { ignoreClone } from "../clone/CloneManager";
import { AnimationProperty } from "./enums/AnimationProperty";
import { AnimatorLayerData } from "./AnimatorLayerData";
import { AnimatorStateData } from "./AnimatorStateData";

/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  /** The playback speed of the Animator, 1.0 is normal playback speed. */
  speed: number = 0.1;
  animatorController: AnimatorController;
  playing: boolean;

  @ignoreClone
  private _diffValueFromBasePos: InterpolableValue;
  @ignoreClone
  private _diffFloatFromBasePos: number = 0;
  @ignoreClone
  private _diffVector2FromBasePos: Vector2 = new Vector2();
  @ignoreClone
  private _diffVector3FromBasePos: Vector3 = new Vector3();
  @ignoreClone
  private _diffVector4FromBasePos: Vector4 = new Vector4();
  @ignoreClone
  private _diffQuaternionFromBasePos: Quaternion = new Quaternion();
  @ignoreClone
  private _tempVector3: Vector3 = new Vector3();
  @ignoreClone
  private _tempQuaternion: Quaternion = new Quaternion();
  @ignoreClone
  private _animatorLayersData: AnimatorLayerData[] = [];
  @ignoreClone
  private _mergedCurveIndexList: any = [];

  /**
   * Get all layers from the AnimatorController which belongs this Animator .
   */
  get layers(): Readonly<AnimatorControllerLayer[]> {
    return this.animatorController?.layers || [];
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
  }

  /**
   * Play a state by name.
   * @param stateName - The state name
   * @param layerIndex - The layer index(default 0)
   * @param normalizedTimeOffset - The time offset between 0 and 1(default 0)
   */
  play(stateName: string, layerIndex: number = 0, normalizedTimeOffset: number = 0): AnimatorState {
    const { animatorController } = this;
    if (!animatorController) {
      return;
    }

    const playState = animatorController.layers[layerIndex].stateMachine.findStateByName(stateName);
    const { playingStateData } = this._getAnimatorLayerData(layerIndex);

    playingStateData.state = playState;
    playingStateData.frameTime = playState.clip.length * normalizedTimeOffset;
    playingStateData.playType = PlayType.NotStart;
    this._setDefaultValueAndTarget(playingStateData);
    this.playing = true;
    return playState;
  }

  /**
   * Cross fade to the AnimationClip by name.
   * @param stateName - The name of the next state
   * @param layerIndex - The layer where the crossfade occurs
   * @param normalizedTransitionDuration - The duration of the transition (normalized)
   * @param normalizedTimeOffset - The time of the next state (normalized)
   */
  crossFade(
    stateName: string,
    layerIndex: number,
    normalizedTransitionDuration: number,
    normalizedTimeOffset: number
  ): void {
    const { animatorController } = this;
    if (!animatorController) {
      return;
    }

    const nextState = animatorController.layers[layerIndex].stateMachine.findStateByName(stateName);
    if (nextState) {
      const { playingStateData, destStateData } = this._getAnimatorLayerData(layerIndex);
      playingStateData.playType = PlayType.IsFading;

      destStateData.state = nextState;
      destStateData.frameTime = 0;
      destStateData.playType = PlayType.NotStart;

      this._setDefaultValueAndTarget(destStateData);

      const { state } = playingStateData;
      const transition = state.addTransition(nextState);
      transition.duration = state.clip.length * normalizedTransitionDuration;
      transition.offset = nextState.clip.length * normalizedTimeOffset;
      transition.exitTime = playingStateData.frameTime;
      if (transition.duration > nextState.clipEndTime - transition.offset) {
        transition.duration = nextState.clipEndTime - transition.offset;
      }

      const playingClip = state.clip;
      let count = playingClip._curves.length;
      this._mergedCurveIndexList = [];
      const targetProperty: number[][] = [];
      const mergedCurveIndexList = this._mergedCurveIndexList;
      for (let i = count - 1; i >= 0; i--) {
        const { instanceId } = playingStateData.curveDatas[i].target;
        const { property } = playingClip._curves[i];
        targetProperty[instanceId] = targetProperty[instanceId] || [];
        if (targetProperty[instanceId][property] === undefined) {
          targetProperty[instanceId][property] = mergedCurveIndexList.length;
          mergedCurveIndexList.push([i]);
        }
      }
      const destClip = nextState.clip;
      count = destClip._curves.length;
      for (let i = count - 1; i >= 0; i--) {
        const { instanceId } = destStateData.curveDatas[i].target;
        const { property } = destClip._curves[i];
        if (targetProperty[instanceId][property] >= 0) {
          const index = targetProperty[instanceId][property];
          mergedCurveIndexList[index][1] = i;
        } else {
          targetProperty[instanceId][property] = mergedCurveIndexList.length;
          mergedCurveIndexList.push([null, i]);
        }
      }
    }
  }

  /**
   * Evaluates the animator component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update
   */
  update(deltaTime: number): void {
    if (this.speed === 0) return;
    if (!this.playing) return;
    deltaTime *= this.speed;
    const { animatorController } = this;
    if (!animatorController) return;
    const { layers } = animatorController;
    for (let i = 0; i < layers.length; i++) {
      const isFirstLayer = i === 0;
      if (this._animatorLayersData[i]) {
        const { playingStateData } = this._animatorLayersData[i];
        playingStateData.frameTime += deltaTime / 1000;
        if (playingStateData.playType === PlayType.IsPlaying) {
          if (playingStateData.frameTime > playingStateData.state.clipEndTime) {
            if (playingStateData.state.wrapMode === WrapMode.Loop) {
              playingStateData.frameTime %= playingStateData.state.clipEndTime;
            } else {
              playingStateData.frameTime = playingStateData.state.clipEndTime;
            }
          }
        }
        this._updateLayer(i, isFirstLayer, deltaTime);
      }
    }
  }

  /**
   * Return the layer by name.
   * @param name - The layer name
   */
  getLayerByName(name: string): AnimatorControllerLayer {
    if (this.animatorController) {
      return this.animatorController.findLayerByName(name);
    }
    return null;
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

  /**
   * @internal
   */
  _setDefaultValueAndTarget(stateData: AnimatorStateData): void {
    const { clip } = stateData.state;
    if (clip) {
      const curves = clip._curves;
      const { length: curvesCount } = curves;
      for (let i = curvesCount - 1; i >= 0; i--) {
        const curve = curves[i];
        const { relativePath, property } = curve;
        const targetEntity = this.entity.findByPath(relativePath);
        let defaultValue: InterpolableValue;
        switch (property) {
          case AnimationProperty.Position:
            defaultValue = targetEntity.position;
            break;
          case AnimationProperty.Rotation:
            defaultValue = targetEntity.rotation;
            break;
          case AnimationProperty.Scale:
            defaultValue = targetEntity.scale;
            break;
        }
        stateData.curveDatas[i] = {
          target: targetEntity,
          defaultValue
        };
      }
    }
  }

  private _calculateDiff(
    valueType: InterpolableValueType,
    property: AnimationProperty,
    sVal: InterpolableValue,
    dVal: InterpolableValue
  ): void {
    switch (valueType) {
      case InterpolableValueType.Float:
        this._calculateFloatDiff(property, sVal as number, dVal as number);
        break;
      case InterpolableValueType.Vector2:
        this._calculateVector2Diff(property, sVal as Vector2, dVal as Vector2);
        break;
      case InterpolableValueType.Vector3:
        this._calculateVector3Diff(property, sVal as Vector3, dVal as Vector3);
        break;
      case InterpolableValueType.Vector3:
        this._calculateVector4Diff(property, sVal as Vector4, dVal as Vector4);
        break;
      case InterpolableValueType.Quaternion:
        this._calculateQuaternionDiff(dVal as Quaternion, sVal as Quaternion);
        break;
    }
  }

  private _getAnimatorLayerData(layerIndex: number): AnimatorLayerData {
    let animatorLayerData = this._animatorLayersData[layerIndex];
    animatorLayerData || (this._animatorLayersData[layerIndex] = animatorLayerData = new AnimatorLayerData());
    return animatorLayerData;
  }

  private _calculateFloatDiff(property: AnimationProperty, sVal: number, dVal: number): void {
    if (property === AnimationProperty.Scale) {
      this._diffFloatFromBasePos = dVal / sVal;
    } else {
      this._diffFloatFromBasePos = dVal - sVal;
    }
    this._diffValueFromBasePos = this._diffFloatFromBasePos;
  }

  private _calculateVector2Diff(property: AnimationProperty, sVal: Vector2, dVal: Vector2): void {
    if (property === AnimationProperty.Scale) {
      this._diffVector2FromBasePos.x = dVal.x / sVal.x;
      this._diffVector2FromBasePos.y = dVal.y / sVal.y;
    } else {
      this._diffVector2FromBasePos.x = dVal.x - sVal.x;
      this._diffVector2FromBasePos.y = dVal.y - sVal.y;
    }
    this._diffValueFromBasePos = this._diffVector2FromBasePos;
  }

  private _calculateVector3Diff(property: AnimationProperty, sVal: Vector3, dVal: Vector3): void {
    if (property === AnimationProperty.Scale) {
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

  private _calculateVector4Diff(property: AnimationProperty, sVal: Vector4, dVal: Vector4): void {
    if (property === AnimationProperty.Scale) {
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
    property: AnimationProperty,
    sVal: InterpolableValue,
    dVal: InterpolableValue,
    crossWeight: number
  ): InterpolableValue {
    const transform = target.transform;
    if (type === Transform) {
      switch (property) {
        case AnimationProperty.Position:
          Vector3.lerp(sVal as Vector3, dVal as Vector3, crossWeight, this._tempVector3);
          return this._tempVector3;
        case AnimationProperty.Rotation:
          Quaternion.slerp(sVal as Quaternion, dVal as Quaternion, crossWeight, this._tempQuaternion);
          return this._tempQuaternion;
        case AnimationProperty.Scale: {
          const scale = transform.scale;
          Vector3.lerp(sVal as Vector3, dVal as Vector3, crossWeight, this._tempVector3);
          transform.scale = scale;
          return this._tempVector3;
        }
      }
    }
  }

  private _applyClipValue(
    target: Entity,
    type: new (entity: Entity) => Component,
    property: AnimationProperty,
    srcValue: InterpolableValue,
    dstValue: InterpolableValue,
    weight: number
  ): void {
    const transform = target.transform;
    if (type === Transform) {
      switch (property) {
        case AnimationProperty.Position:
          if (weight === 1.0) {
            transform.position = <Vector3>dstValue;
          } else {
            const position = transform.position;
            Vector3.lerp(<Vector3>srcValue, <Vector3>dstValue, weight, position);
            transform.position = position;
          }
          break;
        case AnimationProperty.Rotation:
          if (weight === 1.0) {
            transform.rotationQuaternion = <Quaternion>dstValue;
          } else {
            const rotationQuaternion = transform.rotationQuaternion;
            Quaternion.slerp(<Quaternion>srcValue, <Quaternion>dstValue, weight, rotationQuaternion);
            transform.rotationQuaternion = rotationQuaternion;
          }
          break;
        case AnimationProperty.Scale:
          if (weight === 1.0) {
            transform.scale = <Vector3>dstValue;
          } else {
            const scale = transform.scale;
            Vector3.lerp(<Vector3>srcValue, <Vector3>dstValue, weight, scale);
            transform.scale = scale;
          }
          break;
      }
    }
  }

  private _updateAdditiveLayerValue(
    target: Entity,
    type: new (entity: Entity) => Component,
    property: AnimationProperty,
    diffVal: InterpolableValue,
    weight: number
  ): void {
    const transform = (<Entity>target).transform;
    if (type === Transform) {
      switch (property) {
        case AnimationProperty.Position:
          const position = transform.position;
          position.x += (diffVal as Vector3).x;
          position.y += (diffVal as Vector3).y;
          position.z += (diffVal as Vector3).z;
          transform.position = position;
          break;
        case AnimationProperty.Rotation:
          const rotationQuaternion = transform.rotationQuaternion;
          AnimatorUtils.calQuaternionWeight(diffVal as Quaternion, weight, diffVal as Quaternion);
          (diffVal as Quaternion).normalize();
          rotationQuaternion.multiply(diffVal as Quaternion);
          transform.rotationQuaternion = rotationQuaternion;
          break;
        case AnimationProperty.Scale:
          const scale = transform.scale;
          AnimatorUtils.calScaleWeight(scale, weight, scale);
          scale.x = scale.x * (diffVal as Vector3).x;
          scale.y = scale.y * (diffVal as Vector3).y;
          scale.z = scale.z * (diffVal as Vector3).z;
          transform.scale = scale;
          break;
      }
    }
  }

  private _updateLayer(layerIndex: number, isFirstLayer: boolean, deltaTime: number): void {
    const animLayer = this.layers[layerIndex];
    const animlayerData = this._animatorLayersData[layerIndex];
    const { playingStateData, destStateData } = animlayerData;
    const { weight, blendingMode } = animLayer;
    if (playingStateData.playType === PlayType.IsFading) {
      const transition = playingStateData.state.transitions[0];
      if (transition) {
        this._fadingPlayingState(playingStateData, transition, destStateData, animlayerData, weight, deltaTime);
      }
    } else {
      this._updatePlayingState(playingStateData, isFirstLayer, weight, blendingMode);
    }
  }

  private _updatePlayingState(
    playingStateData: AnimatorStateData,
    isFirstLayer: boolean,
    weight: number,
    blendingMode: AnimatorLayerBlendingMode
  ) {
    playingStateData.playType = PlayType.IsPlaying;
    const clip = playingStateData.state.clip;
    const count = clip._curves.length;
    const frameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
    for (let i = count - 1; i >= 0; i--) {
      const { curve, type, property } = clip._curves[i];
      const value = curve.evaluate(frameTime);
      const { target, defaultValue } = playingStateData.curveDatas[i];
      if (isFirstLayer) {
        this._applyClipValue(target, type, property, defaultValue, value, 1.0);
      } else {
        if (blendingMode === AnimatorLayerBlendingMode.Additive) {
          const { _valueType } = curve;
          const firstFrameValue = curve.keys[0].value;
          this._calculateDiff(_valueType, property, firstFrameValue, value);
          this._updateAdditiveLayerValue(target, type, property, this._diffValueFromBasePos, weight);
        } else {
          this._applyClipValue(target, type, property, defaultValue, value, weight);
        }
      }
    }
  }

  private _fadingPlayingState(
    playingStateData: AnimatorStateData,
    transition: AnimatorStateTransition,
    destStateData: AnimatorStateData,
    animlayerData: AnimatorLayerData,
    weight: number,
    deltaTime: number
  ) {
    const destinationState = destStateData.state;
    const curClip = playingStateData.state.clip;
    const nextClip = destinationState.clip;
    let crossWeight: number;
    transition._crossFadeFrameTime += deltaTime / 1000;
    let frameTime = transition.offset + transition._crossFadeFrameTime;
    if (frameTime > destinationState.clipEndTime) {
      if (destinationState.wrapMode === WrapMode.Loop) {
        frameTime %= destinationState.clipEndTime;
      } else {
        frameTime = destinationState.clipEndTime;
      }
    }
    crossWeight = transition._crossFadeFrameTime / transition.duration;
    if (crossWeight >= 1) {
      crossWeight = 1;
      playingStateData.playType = PlayType.IsFinish;
    }

    const mergedCurveIndexList = this._mergedCurveIndexList;
    const count = mergedCurveIndexList.length;
    for (let i = count - 1; i >= 0; i--) {
      const curCurveIndex = mergedCurveIndexList[i][0];
      const nextCurveIndex = mergedCurveIndexList[i][1];
      if (curCurveIndex && nextCurveIndex) {
        const { curve: curCurve, type, property } = curClip._curves[curCurveIndex];
        const { curve: nextCurve } = nextClip._curves[nextCurveIndex];
        const curFrameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
        const curVal = curCurve.evaluate(curFrameTime);
        const destVal = nextCurve.evaluate(frameTime);
        const { target, defaultValue } = playingStateData.curveDatas[curCurveIndex];
        const calculatedValue = this._getCrossFadeValue(target, type, property, curVal, destVal, crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
      } else if (curCurveIndex) {
        const { curve: curCurve, type, property } = curClip._curves[curCurveIndex];
        const { target, defaultValue } = playingStateData.curveDatas[curCurveIndex];
        const curFrameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
        const curVal = curCurve.evaluate(curFrameTime);
        const calculatedValue = this._getCrossFadeValue(target, type, property, defaultValue, curVal, 1 - crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
      } else {
        const { target, defaultValue } = destStateData.curveDatas[curCurveIndex];
        const { curve, type, property } = nextClip._curves[curCurveIndex];
        const val = curve.evaluate(frameTime);
        const calculatedValue = this._getCrossFadeValue(target, type, property, defaultValue, val, crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
      }
    }
    if (playingStateData.playType === PlayType.IsFinish) {
      animlayerData.playingStateData = animlayerData.destStateData;
      animlayerData.playingStateData.frameTime = frameTime;
      animlayerData.destStateData = null;
    }
  }
}
