import { Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { ClassPool } from "../RenderPipeline/ClassPool";
import { Transform } from "../Transform";
import { AnimationCureOwner } from "./AnimationCureOwner";
import { AnimatorController } from "./AnimatorController";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { AnimatorLayerData } from "./AnimatorLayerData";
import { AnimatorStateData } from "./AnimatorStateData";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { AnimatorUtils } from "./AnimatorUtils";
import { CrossCurveData } from "./CrossCurveData";
import { CurveData } from "./CurveData";
import { AnimationProperty } from "./enums/AnimationProperty";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { InterpolableValueType } from "./enums/InterpolableValueType";
import { LayerPlayState } from "./enums/LayerPlayState";
import { StatePlayState } from "./enums/StatePlayState";
import { WrapMode } from "./enums/WrapMode";
import { InterpolableValue } from "./KeyFrame";

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
  private _crossCurveData: CrossCurveData[] = [];
  @ignoreClone
  private _transitionForPose: AnimatorStateTransition = new AnimatorStateTransition();
  @ignoreClone
  private _animationCureOwners: AnimationCureOwner[][] = [];
  @ignoreClone
  private _crossCurveDataPool: ClassPool<CrossCurveData> = new ClassPool(CrossCurveData);

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
    const animatorLayerData = this._getAnimatorLayerData(layerIndex);
    const { playingStateData } = animatorLayerData;
    if (playingStateData.state) {
      this._revertDefaultValue(playingStateData);
    }

    animatorLayerData.playState = LayerPlayState.Playing;
    playingStateData.state = playState;
    playingStateData.frameTime = playState.clip.length * normalizedTimeOffset;
    playingStateData.playState = StatePlayState.Playing;
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
    //CM: CrossFade  三个动作交叉优化
    //CM: 播放完成目标动作后是否允许其值呗修改（建议允许，动作结束以及没播放前均允许修改）
    //CM: cross Fade 时间大于目标动作或者源动作的问题
    const { animatorController } = this;
    if (!animatorController) {
      return;
    }

    const nextState = animatorController.layers[layerIndex].stateMachine.findStateByName(stateName);
    if (nextState) {
      const animatorLayerData = this._getAnimatorLayerData(layerIndex);
      const playState = animatorLayerData.playState;

      const { playingStateData, destStateData } = animatorLayerData;
      const { state } = playingStateData;
      let transition: AnimatorStateTransition;

      destStateData.state = nextState;
      destStateData.frameTime = 0;
      destStateData.playState = StatePlayState.Crossing;
      this._setDefaultValueAndTarget(destStateData);

      switch (playState) {
        // Maybe not play, maybe end.
        case LayerPlayState.Standby:
          animatorLayerData.playState = LayerPlayState.FixedCrossFading;
          this._clearCrossData(animatorLayerData);
          this._prepareStandbyCrossFading(animatorLayerData);
          this._animatorLayersData[layerIndex].playingStateData = new AnimatorStateData();
          transition = this._transitionForPose;
          break;
        case LayerPlayState.Playing:
          animatorLayerData.playState = LayerPlayState.CrossFading;
          this._clearCrossData(animatorLayerData);
          this._prepareCrossFading(animatorLayerData);
          playingStateData.playState = StatePlayState.Fading;
          transition = state.addTransition(nextState);
          break;
        case LayerPlayState.CrossFading:
          animatorLayerData.playState = LayerPlayState.FixedCrossFading;
          this._prepareFiexdPoseCrossFading(animatorLayerData);
          this._animatorLayersData[layerIndex].playingStateData = new AnimatorStateData();
          transition = this._transitionForPose;
          break;
        case LayerPlayState.FixedCrossFading:
          this._prepareFiexdPoseCrossFading(animatorLayerData);
          break;
      }

      const clipLength = nextState.clip.length;
      transition.duration = clipLength * normalizedTransitionDuration;
      transition.offset = clipLength * normalizedTimeOffset;
      if (transition.duration > nextState.clipEndTime - transition.offset) {
        transition.duration = nextState.clipEndTime - transition.offset;
      }
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
    for (let i = 0, n = animatorController.layers.length; i < n; i++) {
      const isFirstLayer = i === 0;
      const animatorLayerData = animatorLayersData[i];
      const { playingStateData } = animatorLayerData;
      playingStateData.frameTime += deltaTime / 1000;
      if (playingStateData.playState === StatePlayState.Playing) {
        if (playingStateData.frameTime > playingStateData.state.clipEndTime) {
          if (playingStateData.state.wrapMode === WrapMode.Loop) {
            playingStateData.frameTime %= playingStateData.state.clipEndTime;
          } else {
            playingStateData.frameTime = playingStateData.state.clipEndTime;
            playingStateData.playState = StatePlayState.Finished;
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
      if (!stateData.curveDataCollection[i]) {
        //CM: 两种对象初始化时机解耦
        const propertyOwner = propertyOwners[property] || (propertyOwners[property] = new AnimationCureOwner());
        const curveData = new CurveData();
        propertyOwner.target = targetEntity;
        curveData.owner = propertyOwner;
        curveData.clipCurveData = curve;

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
        stateData.curveDataCollection[i] = curveData;
      }
    }
  }

  private _clearCrossData(animatorLayerData: AnimatorLayerData): void {
    animatorLayerData.crossCurveMark++;
    this._crossCurveData.length = 0;
    this._crossCurveDataPool.resetPool();
  }

  private _addCrossCurveData(
    crossCurveData: CrossCurveData[],
    owner: AnimationCureOwner,
    curCurveIndex: number,
    nextCurveIndex: number
  ): void {
    const dataItem = this._crossCurveDataPool.getFromPool();
    dataItem.owner = owner;
    dataItem.curCurveIndex = curCurveIndex;
    dataItem.nextCurveIndex = nextCurveIndex;
    crossCurveData.push(dataItem);
  }

  private _prepareCrossFading(animatorLayerData: AnimatorLayerData): void {
    // Reset cross fading data.
    const crossCurveData = this._crossCurveData;
    const crossCurveMark = animatorLayerData.crossCurveMark;

    // Add playing cross curve data.
    const playingDataCollection = animatorLayerData.playingStateData.curveDataCollection;
    for (let i = playingDataCollection.length - 1; i >= 0; i--) {
      const owner = playingDataCollection[i].owner;
      owner.crossCurveMark = crossCurveMark;
      owner.crossCurveIndex = crossCurveData.length;
      this._addCrossCurveData(crossCurveData, owner, i, null);
    }

    // Add dest cross curve data.
    const destDataCollection = animatorLayerData.destStateData.curveDataCollection;
    for (let i = destDataCollection.length - 1; i >= 0; i--) {
      const owner = destDataCollection[i].owner;
      if (owner.crossCurveMark === crossCurveMark) {
        crossCurveData[owner.crossCurveIndex].nextCurveIndex = i;
      } else {
        owner.crossCurveMark = crossCurveMark;
        this._addCrossCurveData(crossCurveData, owner, null, i);
      }
    }
  }

  private _prepareFiexdPoseCrossFading(animatorLayerData: AnimatorLayerData): void {
    const crossCurveData = this._crossCurveData;
    const { crossCurveMark, destStateData } = animatorLayerData;

    // Save current cross curve data owner fixed pose.
    for (let i = crossCurveData.length - 1; i >= 0; i--) {
      const dataItem = crossCurveData[i];
      dataItem.owner.saveFixedPoseValue();
    }

    // prepare dest AnimatorState cross data.
    this._prepareDestFixedCross(crossCurveData, destStateData, crossCurveMark);
  }

  //CM: 和 prepare cross fade很像
  private _prepareStandbyCrossFading(animatorLayerData: AnimatorLayerData): void {
    const crossCurveData = this._crossCurveData;
    const { playingStateData, crossCurveMark } = animatorLayerData;

    // Standby have two sub state, one is never play, one is finshed, never play playingStateData is null.
    if (playingStateData) {
      const curveDataCollection = playingStateData.curveDataCollection;
      // Save current cross curve data owner fixed pose.
      for (let i = curveDataCollection.length - 1; i >= 0; i--) {
        const owner = curveDataCollection[i].owner;
        owner.crossCurveMark = crossCurveMark;
        owner.crossCurveIndex = crossCurveData.length;
        owner.saveFixedPoseValue();
        this._addCrossCurveData(crossCurveData, owner, i, null);
      }
    }

    // prepare dest AnimatorState cross data.
    this._prepareDestFixedCross(crossCurveData, animatorLayerData.destStateData, crossCurveMark);
  }

  private _prepareDestFixedCross(
    crossCurveData: CrossCurveData[],
    destStateData: AnimatorStateData<Component>,
    crossCurveMark: number
  ): void {
    // Save dest curve owner fixed pose.
    const curveDataCollection = destStateData.curveDataCollection;
    for (let i = curveDataCollection.length - 1; i >= 0; i--) {
      const owner = curveDataCollection[i].owner;
      // Not inclue in last cross fade.
      if (owner.crossCurveMark === crossCurveMark) {
        crossCurveData[owner.crossCurveIndex].nextCurveIndex = i;
      } else {
        owner.saveFixedPoseValue();
        owner.crossCurveMark = crossCurveMark;
        this._addCrossCurveData(crossCurveData, owner, null, i);
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
    if (destStateData && destStateData.playState === StatePlayState.Crossing) {
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
    playingStateData.playState = StatePlayState.Playing;
    const clip = playingStateData.state.clip;
    const curves = clip._curves;
    const frameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
    for (let i = curves.length - 1; i >= 0; i--) {
      const { curve, type, property } = curves[i];
      const value = curve.evaluate(frameTime);
      const { target, defaultValue } = playingStateData.curveDataCollection[i].owner;
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
      playingStateData.playState = StatePlayState.Finished;
    }

    const mergedCurveIndexList = this._crossCurveData;
    const count = mergedCurveIndexList.length;
    for (let i = count - 1; i >= 0; i--) {
      const { curCurveIndex, nextCurveIndex } = mergedCurveIndexList[i];
      if (curCurveIndex >= 0 && nextCurveIndex >= 0) {
        const { curve: curCurve, type, property } = curClip._curves[curCurveIndex];
        const { curve: nextCurve } = nextClip._curves[nextCurveIndex];
        const curFrameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
        const curVal = curCurve.evaluate(curFrameTime);
        const destVal = nextCurve.evaluate(frameTime);
        const { target, defaultValue } = playingStateData.curveDataCollection[curCurveIndex].owner;
        const calculatedValue = this._getCrossFadeValue(target, type, property, curVal, destVal, crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, 1);
      } else if (curCurveIndex >= 0) {
        const { curve: curCurve, type, property } = curClip._curves[curCurveIndex];
        const { target, defaultValue } = playingStateData.curveDataCollection[curCurveIndex].owner;
        const curFrameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
        const curVal = curCurve.evaluate(curFrameTime);
        const calculatedValue = this._getCrossFadeValue(target, type, property, defaultValue, curVal, 1 - crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
      } else {
        const { target, defaultValue } = destStateData.curveDataCollection[nextCurveIndex].owner;
        const { curve, type, property } = nextClip._curves[nextCurveIndex];
        const val = curve.evaluate(frameTime);
        const calculatedValue = this._getCrossFadeValue(target, type, property, defaultValue, val, crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
      }
    }
    if (playingStateData.playState === StatePlayState.Finished) {
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
      destStateData.playState = StatePlayState.Playing;
    }

    const crossCurveIndies = this._crossCurveData;

    const curves = nextClip._curves;
    for (let i = crossCurveIndies.length - 1; i >= 0; i--) {
      let calculatedValue: InterpolableValue;

      const crossCurveIndex = crossCurveIndies[i];
      const { target, fiexedPoseValue, defaultValue, animationClopCurveData } = crossCurveIndex.owner;
      const { type, property } = animationClopCurveData;
      if (crossCurveIndex.nextCurveIndex) {
        const value = curves[i].curve.evaluate(frameTime);
        calculatedValue = this._getCrossFadeValue(target, type, property, fiexedPoseValue, value, crossWeight);
      } else {
        calculatedValue = this._getCrossFadeValue(target, type, property, fiexedPoseValue, defaultValue, crossWeight);
      }
      this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
    }
    if (destStateData.playState === StatePlayState.Playing) {
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
        const { owner } = playingStateData.curveDataCollection[i];
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
