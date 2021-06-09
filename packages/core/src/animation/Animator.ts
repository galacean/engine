import { Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { Transform } from "../Transform";
import { AnimationCureOwner } from "./AnimationCureOwner";
import { AnimatorController } from "./AnimatorController";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { AnimatorLayerData } from "./AnimatorLayerData";
import { AnimatorStateData } from "./AnimatorStateData";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { AnimatorUtils } from "./AnimatorUtils";
import { CurveData } from "./CurveData";
import { AnimationProperty } from "./enums/AnimationProperty";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { InterpolableValueType } from "./enums/InterpolableValueType";
import { PlayType } from "./enums/PlayType";
import { WrapMode } from "./enums/WrapMode";
import { InterpolableValue } from "./KeyFrame";

interface MergedCurveIndex {
  curCurveIndex: number;
  nextCurveIndex: number;
}

/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  /** The playback speed of the Animator, 1.0 is normal playback speed. */
  speed: number = 1;
  /** All layers from the AnimatorController which belongs this Animator .*/
  animatorController: AnimatorController;

  /** @internal */
  _playing: boolean;

  @ignoreClone
  private _diffValueFromBasePose: InterpolableValue;
  @ignoreClone
  private _diffFloatFromBasePose: number = 0;
  @ignoreClone
  private _diffVector2FromBasePose: Vector2 = new Vector2();
  @ignoreClone
  private _diffVector3FromBasePose: Vector3 = new Vector3();
  @ignoreClone
  private _diffVector4FromBasePose: Vector4 = new Vector4();
  @ignoreClone
  private _diffQuaternionFromBasePose: Quaternion = new Quaternion();
  @ignoreClone
  private _tempVector3: Vector3 = new Vector3();
  @ignoreClone
  private _tempQuaternion: Quaternion = new Quaternion();
  @ignoreClone
  private _animatorLayersData: AnimatorLayerData[] = [];
  @ignoreClone
  private _mergedCurveIndexList: MergedCurveIndex[] = [];
  @ignoreClone
  private _transitionForPose: AnimatorStateTransition = new AnimatorStateTransition();
  @ignoreClone
  private _curveDataForPose: CurveData<Component>[] = []; //CM: 简化
  @ignoreClone
  private _animationCureOwners: AnimationCureOwner[][] = [];

  /**
   * All layers from the AnimatorController which belongs this Animator .
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
  play(stateName: string, layerIndex: number = 0, normalizedTimeOffset: number = 0): void {
    const { animatorController } = this;
    if (!animatorController) {
      return;
    }

    const playState = animatorController.layers[layerIndex].stateMachine.findStateByName(stateName);
    const { playingStateData } = this._getAnimatorLayerData(layerIndex);
    if (playingStateData.state) {
      this._revertDefaultValue(playingStateData);
    }

    playingStateData.state = playState;
    playingStateData.frameTime = playState.clip.length * normalizedTimeOffset;
    playingStateData.playType = PlayType.NotStart;
    this._setDefaultValueAndTarget(playingStateData);
    this._playing = true;
  }

  /**
   * Create a crossfade from the current state to another state.
   * @param stateName - The name of the next state
   * @param layerIndex - The layer where the crossfade occurs
   * @param normalizedTransitionDuration - The duration of the transition (normalized)
   * @param normalizedTimeOffset - The time of the next state (normalized from the dest state's duration)
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
      const { state } = playingStateData;
      const crossFromFixedPose = !state || !this._playing;
      const isCrossFading = playingStateData.playType === PlayType.IsFading;
      let transition: AnimatorStateTransition;
      let mergeTargetProperty: number[][] = [];

      const mergedCurveIndexList = this._mergedCurveIndexList;
      mergedCurveIndexList.length = 0;

      if (isCrossFading) {
        this._saveFixedPose(playingStateData, destStateData);
      }

      destStateData.state = nextState;
      destStateData.frameTime = 0;
      destStateData.playType = PlayType.IsCrossing;

      this._setDefaultValueAndTarget(destStateData);
      if (crossFromFixedPose) {
        this._saveFixedPose(null, destStateData);
      }

      if (crossFromFixedPose || isCrossFading) {
        this._animatorLayersData[layerIndex].playingStateData = new AnimatorStateData();
        transition = this._transitionForPose;
      } else {
        playingStateData.playType = PlayType.IsFading;
        transition = state.addTransition(nextState);
      }

      transition.duration = nextState.clip.length * normalizedTransitionDuration;
      transition.offset = nextState.clip.length * normalizedTimeOffset;
      if (transition.duration > nextState.clipEndTime - transition.offset) {
        transition.duration = nextState.clipEndTime - transition.offset;
      }

      if (!crossFromFixedPose) {
        const curves = state.clip._curves;
        const curveDatas = playingStateData.curveDatas;
        for (let i = curves.length - 1; i >= 0; i--) {
          const { instanceId } = curveDatas[i].owner.target;
          const { property } = curves[i];
          const mergeProperty = mergeTargetProperty[instanceId] || (mergeTargetProperty[instanceId] = []);
          mergeProperty[property] = mergedCurveIndexList.length;
          mergedCurveIndexList.push({
            curCurveIndex: i,
            nextCurveIndex: null
          });
        }
      }
      const curves = nextState.clip._curves;
      const curveDatas = destStateData.curveDatas;
      for (let i = curves.length - 1; i >= 0; i--) {
        const { instanceId } = curveDatas[i].owner.target;
        const { property } = curves[i];
        const mergeProperty = mergeTargetProperty[instanceId] || (mergeTargetProperty[instanceId] = []);
        if (mergeProperty[property] === undefined) {
          mergeProperty[property] = mergedCurveIndexList.length;
          mergedCurveIndexList.push({
            curCurveIndex: null,
            nextCurveIndex: i
          });
        } else {
          const index = mergeProperty[property];
          mergedCurveIndexList[index].nextCurveIndex = i;
        }
      }

      mergeTargetProperty = null;
    }
    this._playing = true;
  }

  /**
   * Evaluates the animator component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update
   */
  update(deltaTime: number): void {
    if (this.speed === 0) {
      return;
    }
    if (!this._playing) {
      return;
    }
    const { animatorController } = this;
    if (!animatorController) {
      return;
    }
    deltaTime *= this.speed;

    const animatorLayersData = this._animatorLayersData;
    const layerCount = animatorController.layers.length;
    for (let i = 0; i < layerCount; i++) {
      const isFirstLayer = i === 0;
      const animatorLayerData = animatorLayersData[i];
      const { playingStateData } = animatorLayerData;
      playingStateData.frameTime += deltaTime / 1000;
      if (playingStateData.playType === PlayType.IsPlaying) {
        if (playingStateData.frameTime > playingStateData.state.clipEndTime) {
          if (playingStateData.state.wrapMode === WrapMode.Loop) {
            playingStateData.frameTime %= playingStateData.state.clipEndTime;
          } else {
            playingStateData.frameTime = playingStateData.state.clipEndTime;
            playingStateData.playType = PlayType.IsFinish;
          }
        }
      }
      this._updateLayer(i, isFirstLayer, deltaTime);
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
  _setDefaultValueAndTarget(stateData: AnimatorStateData<Component>): void {
    const { _animationCureOwners: animationCureOwners } = this;
    const { clip } = stateData.state;
    const curves = clip._curves;
    for (let i = curves.length - 1; i >= 0; i--) {
      const curve = curves[i];
      const { relativePath, property } = curve;
      const targetEntity = this.entity.findByPath(relativePath);
      const { instanceId } = targetEntity;
      const propertyOwners = animationCureOwners[instanceId] || (animationCureOwners[instanceId] = []);
      if (!stateData.curveDatas[i]) {
        //CN: 两种对象初始化时机解耦
        const propertyOwner = propertyOwners[property] || (propertyOwners[property] = new AnimationCureOwner());
        const curveData = new CurveData();
        propertyOwner.target = targetEntity;
        curveData.owner = propertyOwner;
        curveData.curveData = curve;

        switch (property) {
          case AnimationProperty.Position:
            propertyOwner.defaultValue = targetEntity.transform.position.clone();
            propertyOwner.fiexedPoseValue = new Vector3();
            break;
          case AnimationProperty.Rotation:
            propertyOwner.defaultValue = targetEntity.transform.rotationQuaternion.clone();
            propertyOwner.fiexedPoseValue = new Quaternion();
            break;
          case AnimationProperty.Scale:
            propertyOwner.defaultValue = targetEntity.transform.scale.clone();
            propertyOwner.fiexedPoseValue = new Vector3();
            break;
        }
        stateData.curveDatas[i] = curveData;
      }
    }
  }

  private _saveFixedPose(
    playingStateData: AnimatorStateData<Component>,
    destStateData: AnimatorStateData<Component>
  ): void {
    const { _curveDataForPose } = this;
    _curveDataForPose.length = 0;

    //CM: 可否简化
    let effectTargetProperty: boolean[][] = [];
    const nextCurves = destStateData.state.clip._curves;
    for (let i = nextCurves.length - 1; i >= 0; i--) {
      const curve = nextCurves[i];
      const { property } = curve;
      const curveData = destStateData.curveDatas[i];
      const owner = curveData.owner;
      const { target, fiexedPoseValue } = owner;
      const { instanceId } = target;
      _curveDataForPose[i] = curveData;
      const effectProperty = effectTargetProperty[instanceId] || (effectTargetProperty[instanceId] = []);
      effectProperty[property] = true;
      switch (property) {
        case AnimationProperty.Position:
          target.transform.position.cloneTo(<Vector3>fiexedPoseValue);
          break;
        case AnimationProperty.Rotation:
          target.transform.rotationQuaternion.cloneTo(<Quaternion>fiexedPoseValue);
          break;
        case AnimationProperty.Scale:
          target.transform.scale.cloneTo(<Vector3>fiexedPoseValue);
          break;
      }
    }
    if (playingStateData) {
      const curCurves = playingStateData.state.clip._curves;
      for (let i = curCurves.length - 1; i >= 0; i--) {
        const curve = curCurves[i];
        const { property } = curve;
        const curveData = playingStateData.curveDatas[i];
        const { instanceId } = curveData.owner.target;
        if (!effectTargetProperty[instanceId][property]) {
          _curveDataForPose.push(curveData);
        }
      }
    }
    effectTargetProperty = null;
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
      this._diffFloatFromBasePose = dVal / sVal;
    } else {
      this._diffFloatFromBasePose = dVal - sVal;
    }
    this._diffValueFromBasePose = this._diffFloatFromBasePose;
  }

  private _calculateVector2Diff(property: AnimationProperty, sVal: Vector2, dVal: Vector2): void {
    if (property === AnimationProperty.Scale) {
      this._diffVector2FromBasePose.x = dVal.x / sVal.x;
      this._diffVector2FromBasePose.y = dVal.y / sVal.y;
    } else {
      this._diffVector2FromBasePose.x = dVal.x - sVal.x;
      this._diffVector2FromBasePose.y = dVal.y - sVal.y;
    }
    this._diffValueFromBasePose = this._diffVector2FromBasePose;
  }

  private _calculateVector3Diff(property: AnimationProperty, sVal: Vector3, dVal: Vector3): void {
    if (property === AnimationProperty.Scale) {
      this._diffVector3FromBasePose.x = dVal.x / sVal.x;
      this._diffVector3FromBasePose.y = dVal.y / sVal.y;
      this._diffVector3FromBasePose.z = dVal.z / sVal.z;
    } else {
      this._diffVector3FromBasePose.x = dVal.x - sVal.x;
      this._diffVector3FromBasePose.y = dVal.y - sVal.y;
      this._diffVector3FromBasePose.z = dVal.z - sVal.z;
    }
    this._diffValueFromBasePose = this._diffVector3FromBasePose;
  }

  private _calculateVector4Diff(property: AnimationProperty, sVal: Vector4, dVal: Vector4): void {
    if (property === AnimationProperty.Scale) {
      this._diffVector4FromBasePose.x = dVal.x / sVal.x;
      this._diffVector4FromBasePose.y = dVal.y / sVal.y;
      this._diffVector4FromBasePose.z = dVal.z / sVal.z;
      this._diffVector4FromBasePose.w = dVal.w / sVal.w;
    } else {
      this._diffVector4FromBasePose.x = dVal.x - sVal.x;
      this._diffVector4FromBasePose.y = dVal.y - sVal.y;
      this._diffVector4FromBasePose.z = dVal.z - sVal.z;
      this._diffVector4FromBasePose.w = dVal.w - sVal.w;
    }
    this._diffValueFromBasePose = this._diffVector4FromBasePose;
  }

  private _calculateQuaternionDiff(dVal: Quaternion, sVal: Quaternion): void {
    Quaternion.conjugate(sVal, this._diffQuaternionFromBasePose);
    Quaternion.multiply(this._diffQuaternionFromBasePose, dVal, this._diffQuaternionFromBasePose);
    this._diffValueFromBasePose = this._diffQuaternionFromBasePose;
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
    if (destStateData && destStateData.playType === PlayType.IsCrossing) {
      const crossFromFixedPose = !playingStateData.state;
      if (crossFromFixedPose) {
        this._updateCrossFadeFromPose(this._transitionForPose, destStateData, animlayerData, weight, deltaTime);
      } else {
        const transition = playingStateData.state.transitions[0];
        if (transition) {
          this._updateCrossFade(playingStateData, transition, destStateData, animlayerData, weight, deltaTime);
        }
      }
    } else {
      this._updatePlayingState(playingStateData, isFirstLayer, weight, blendingMode);
    }
  }

  private _updatePlayingState(
    playingStateData: AnimatorStateData<Component>,
    isFirstLayer: boolean,
    weight: number,
    blendingMode: AnimatorLayerBlendingMode
  ) {
    playingStateData.playType = PlayType.IsPlaying;
    const clip = playingStateData.state.clip;
    const curves = clip._curves;
    const frameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
    for (let i = curves.length - 1; i >= 0; i--) {
      const { curve, type, property } = curves[i];
      const value = curve.evaluate(frameTime);
      const { target, defaultValue } = playingStateData.curveDatas[i].owner;
      if (isFirstLayer) {
        this._applyClipValue(target, type, property, defaultValue, value, 1.0);
      } else {
        if (blendingMode === AnimatorLayerBlendingMode.Additive) {
          const { _valueType } = curve;
          const firstFrameValue = curve.keys[0].value;
          this._calculateDiff(_valueType, property, firstFrameValue, value);
          this._updateAdditiveLayerValue(target, type, property, this._diffValueFromBasePose, weight);
        } else {
          this._applyClipValue(target, type, property, defaultValue, value, weight);
        }
      }
    }
  }

  private _updateCrossFade(
    playingStateData: AnimatorStateData<Component>,
    transition: AnimatorStateTransition,
    destStateData: AnimatorStateData<Component>,
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
      const { curCurveIndex, nextCurveIndex } = mergedCurveIndexList[i];
      if (curCurveIndex >= 0 && nextCurveIndex >= 0) {
        const { curve: curCurve, type, property } = curClip._curves[curCurveIndex];
        const { curve: nextCurve } = nextClip._curves[nextCurveIndex];
        const curFrameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
        const curVal = curCurve.evaluate(curFrameTime);
        const destVal = nextCurve.evaluate(frameTime);
        const { target, defaultValue } = playingStateData.curveDatas[curCurveIndex].owner;
        const calculatedValue = this._getCrossFadeValue(target, type, property, curVal, destVal, crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, 1);
      } else if (curCurveIndex >= 0) {
        const { curve: curCurve, type, property } = curClip._curves[curCurveIndex];
        const { target, defaultValue } = playingStateData.curveDatas[curCurveIndex].owner;
        const curFrameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
        const curVal = curCurve.evaluate(curFrameTime);
        const calculatedValue = this._getCrossFadeValue(target, type, property, defaultValue, curVal, 1 - crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
      } else {
        const { target, defaultValue } = destStateData.curveDatas[nextCurveIndex].owner;
        const { curve, type, property } = nextClip._curves[nextCurveIndex];
        const val = curve.evaluate(frameTime);
        const calculatedValue = this._getCrossFadeValue(target, type, property, defaultValue, val, crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
      }
    }
    if (playingStateData.playType === PlayType.IsFinish) {
      animlayerData.playingStateData = animlayerData.destStateData;
      animlayerData.playingStateData.frameTime = frameTime;
      animlayerData.destStateData = new AnimatorStateData();
    }
  }

  private _updateCrossFadeFromPose(
    transition: AnimatorStateTransition,
    destStateData: AnimatorStateData<Component>,
    animlayerData: AnimatorLayerData,
    weight: number,
    deltaTime: number
  ) {
    const destinationState = destStateData.state;
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
      destStateData.playType = PlayType.IsPlaying;
    }

    const curveDataForPose = this._curveDataForPose;
    const count = curveDataForPose.length;

    for (let i = count - 1; i >= 0; i--) {
      const curveData = curveDataForPose[i];
      const { curveData: fixedPoseCurveData } = curveData;
      const { target, defaultValue, fiexedPoseValue } = curveData.owner;

      const destCurveData = destStateData.curveDatas[i];
      let calculatedValue: InterpolableValue;
      const { type, property } = fixedPoseCurveData;
      const { curve } = nextClip._curves[i];
      if (destCurveData) {
        const val = curve.evaluate(frameTime);
        calculatedValue = this._getCrossFadeValue(target, type, property, fiexedPoseValue, val, crossWeight);
      } else {
        calculatedValue = this._getCrossFadeValue(target, type, property, fiexedPoseValue, defaultValue, crossWeight);
      }
      this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
    }
    if (destStateData.playType === PlayType.IsPlaying) {
      animlayerData.playingStateData = animlayerData.destStateData;
      animlayerData.playingStateData.frameTime = frameTime;
      animlayerData.destStateData = new AnimatorStateData();
    }
  }

  private _revertDefaultValue(playingStateData: AnimatorStateData<Component>) {
    const { clip } = playingStateData.state;
    if (clip) {
      const curves = clip._curves;
      for (let i = curves.length - 1; i >= 0; i--) {
        const curve = curves[i];
        const { owner } = playingStateData.curveDatas[i];
        const { transform } = owner.target;
        switch (curve.property) {
          case AnimationProperty.Position:
            transform.position = <Vector3>owner.defaultValue;
            break;
          case AnimationProperty.Rotation:
            transform.rotationQuaternion = <Quaternion>owner.defaultValue;
            break;
          case AnimationProperty.Scale:
            transform.scale = <Vector3>owner.defaultValue;
            break;
        }
      }
    }
  }
}
