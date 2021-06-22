import { Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { ClassPool } from "../RenderPipeline/ClassPool";
import { Transform } from "../Transform";
import { AnimationCureOwner } from "./internal/AnimationCureOwner";
import { AnimatorController } from "./AnimatorController";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { AnimatorLayerData } from "./internal/AnimatorLayerData";
import { AnimatorStateData } from "./internal/AnimatorStataData";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { AnimatorUtils } from "./AnimatorUtils";
import { CrossCurveData } from "./internal/CrossCurveData";
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
  private _animationCureOwners: AnimationCureOwner<Component>[][] = [];
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
   * @param layerIndex - The layer index(default -1). If layer is -1, play the first state with the given state name
   * @param normalizedTimeOffset - The time offset between 0 and 1(default 0)
   */
  play(stateName: string, layerIndex: number = -1, normalizedTimeOffset: number = 0): void {
    const { animatorController } = this;
    if (!animatorController) {
      return;
    }

    let playState: AnimatorState;
    const layers = animatorController.layers;
    if (layerIndex === -1) {
      for (let i = 0, n = layers.length; i < n; i--) {
        playState = layers[i].stateMachine.findStateByName(stateName);
        if (playState) {
          layerIndex = i;
          break;
        }
      }
    } else {
      playState = layers[layerIndex].stateMachine.findStateByName(stateName);
    }
    if (!playState) {
      return;
    }

    const animatorLayerData = this._getAnimatorLayerData(layerIndex);
    const { srcPlayData } = animatorLayerData;
    const { state } = srcPlayData;
    if (state && state !== playState) {
      this._revertDefaultValue(srcPlayData);
    }

    const animatorStateData = this._getAnimatorStateData(stateName, playState, animatorLayerData);

    animatorLayerData.playState = LayerPlayState.Playing;
    srcPlayData.state = playState;
    srcPlayData.frameTime = playState.clip.length * normalizedTimeOffset;
    srcPlayData.playState = StatePlayState.Playing;
    srcPlayData.stateData = animatorStateData;

    this._setDefaultValues(animatorStateData);
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

      const { srcPlayData, destPlayData } = animatorLayerData;
      const { state } = srcPlayData;
      let transition: AnimatorStateTransition;

      const animatorStateData = this._getAnimatorStateData(stateName, nextState, animatorLayerData);
      destPlayData.state = nextState;
      destPlayData.frameTime = 0;
      destPlayData.playState = StatePlayState.Crossing;
      destPlayData.stateData = animatorStateData;

      this._setDefaultValues(animatorStateData);

      switch (playState) {
        // Maybe not play, maybe end.
        case LayerPlayState.Standby:
          animatorLayerData.playState = LayerPlayState.FixedCrossFading;
          this._clearCrossData(animatorLayerData);
          this._prepareStandbyCrossFading(animatorLayerData);
          animatorLayerData.srcPlayData = new AnimatorStatePlayData();
          transition = this._transitionForPose;
          break;
        case LayerPlayState.Playing:
          animatorLayerData.playState = LayerPlayState.CrossFading;
          this._clearCrossData(animatorLayerData);
          this._prepareCrossFading(animatorLayerData);
          srcPlayData.playState = StatePlayState.Fading;
          transition = state.addTransition(nextState);
          break;
        case LayerPlayState.CrossFading:
          animatorLayerData.playState = LayerPlayState.FixedCrossFading;
          this._prepareFiexdPoseCrossFading(animatorLayerData);
          animatorLayerData.srcPlayData = new AnimatorStatePlayData();
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
  }

  /**
   * Evaluates the animator component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update
   */
  update(deltaTime: number): void {
    if (this.speed === 0) {
      return;
    }

    const { animatorController } = this;
    if (!animatorController) {
      return;
    }
    deltaTime *= this.speed;

    for (let i = 0, n = animatorController.layers.length; i < n; i++) {
      const animatorLayerData = this._getAnimatorLayerData(i);
      if (animatorLayerData.playState === LayerPlayState.Standby) {
        continue;
      }

      const isFirstLayer = i === 0;
      const { srcPlayData } = animatorLayerData;
      srcPlayData.frameTime += deltaTime / 1000;
      if (srcPlayData.playState === StatePlayState.Playing) {
        if (srcPlayData.frameTime > srcPlayData.state.clipEndTime) {
          if (srcPlayData.state.wrapMode === WrapMode.Loop) {
            srcPlayData.frameTime %= srcPlayData.state.clipEndTime;
          } else {
            srcPlayData.frameTime = srcPlayData.state.clipEndTime;
            srcPlayData.playState = StatePlayState.Finished;
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
  _setDefaultValues(animatorStateData: AnimatorStateData<Component>): void {
    const { owners } = animatorStateData;
    for (let i = owners.length - 1; i >= 0; i--) {
      owners[i].saveDefaultValue();
    }
  }

  private _getAnimatorStateData(
    stateName: string,
    animatorState: AnimatorState,
    animatorLayerData: AnimatorLayerData
  ): AnimatorStateData<Component> {
    const { animatorStateDataCollection } = animatorLayerData;
    let animatorStateData = animatorStateDataCollection[stateName];
    if (!animatorStateData) {
      animatorStateData = new AnimatorStateData<Component>();
      animatorStateDataCollection[stateName] = animatorStateData;
      this._saveAnimatorStateData(animatorState, animatorStateData);
    }
    return animatorStateData;
  }

  private _saveAnimatorStateData(animatorState: AnimatorState, animatorStateData: AnimatorStateData<Component>): void {
    const { entity, _animationCureOwners: animationCureOwners } = this;
    const { owners } = animatorStateData;
    const { _curves: curves } = animatorState.clip;
    for (let i = curves.length - 1; i >= 0; i--) {
      const curve = curves[i];
      const targetEntity = entity.findByPath(curve.relativePath);
      const { property } = curve;
      const { instanceId } = targetEntity;
      const propertyOwners = animationCureOwners[instanceId] || (animationCureOwners[instanceId] = []);
      owners[i] =
        propertyOwners[property] ||
        (propertyOwners[property] = new AnimationCureOwner(targetEntity, curve.type, property));
    }
  }

  private _clearCrossData(animatorLayerData: AnimatorLayerData): void {
    animatorLayerData.crossCurveMark++;
    this._crossCurveData.length = 0;
    this._crossCurveDataPool.resetPool();
  }

  private _addCrossCurveData(
    crossCurveData: CrossCurveData[],
    owner: AnimationCureOwner<Component>,
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
    const crossCurveData = this._crossCurveData;
    const { crossCurveMark } = animatorLayerData;

    // Add src cross curve data.
    this._prepareSrcCrossData(crossCurveData, animatorLayerData.srcPlayData, crossCurveMark, false);
    // Add dest cross curve data.
    this._prepareDestCrossData(crossCurveData, animatorLayerData.destPlayData, crossCurveMark, false);
  }

  private _prepareStandbyCrossFading(animatorLayerData: AnimatorLayerData): void {
    const crossCurveData = this._crossCurveData;
    const { srcPlayData, crossCurveMark } = animatorLayerData;

    // Standby have two sub state, one is never play, one is finshed, never play srcPlayData is null.
    srcPlayData && this._prepareSrcCrossData(crossCurveData, srcPlayData, crossCurveMark, true);
    // Add dest cross curve data.
    this._prepareDestCrossData(crossCurveData, animatorLayerData.destPlayData, crossCurveMark, true);
  }

  private _prepareFiexdPoseCrossFading(animatorLayerData: AnimatorLayerData): void {
    const crossCurveData = this._crossCurveData;

    // Save current cross curve data owner fixed pose.
    for (let i = crossCurveData.length - 1; i >= 0; i--) {
      const dataItem = crossCurveData[i];
      dataItem.owner.saveFixedPoseValue();
    }
    // prepare dest AnimatorState cross data.
    this._prepareDestCrossData(crossCurveData, animatorLayerData.destPlayData, animatorLayerData.crossCurveMark, true);
  }

  private _prepareSrcCrossData(
    crossCurveData: CrossCurveData[],
    srcPlayData: AnimatorStatePlayData<Component>,
    crossCurveMark: number,
    saveFixed: boolean
  ): void {
    const { owners } = srcPlayData.stateData;

    for (let i = owners.length - 1; i >= 0; i--) {
      const owner = owners[i];
      owner.crossCurveMark = crossCurveMark;
      owner.crossCurveIndex = crossCurveData.length;
      saveFixed && owner.saveFixedPoseValue();
      this._addCrossCurveData(crossCurveData, owner, i, null);
    }
  }

  private _prepareDestCrossData(
    crossCurveData: CrossCurveData[],
    destPlayData: AnimatorStatePlayData<Component>,
    crossCurveMark: number,
    saveFixed: boolean
  ): void {
    const { owners } = destPlayData.stateData;

    for (let i = owners.length - 1; i >= 0; i--) {
      const owner = owners[i];
      // Not inclue in previous AnimatorState.
      if (owner.crossCurveMark === crossCurveMark) {
        crossCurveData[owner.crossCurveIndex].nextCurveIndex = i;
      } else {
        saveFixed && owner.saveFixedPoseValue();
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
    const { srcPlayData, destPlayData } = animlayerData;
    const { weight, blendingMode } = animLayer;
    if (destPlayData && destPlayData.playState === StatePlayState.Crossing) {
      const crossFromFixedPose = !srcPlayData.state;
      if (crossFromFixedPose) {
        this._updateCrossFadeFromPose(this._transitionForPose, destPlayData, animlayerData, weight, deltaTime);
      } else {
        const transition = srcPlayData.state.transitions[0];
        if (transition) {
          this._updateCrossFade(srcPlayData, transition, destPlayData, animlayerData, weight, deltaTime);
        }
      }
    } else {
      this._updatePlayingState(srcPlayData, isFirstLayer, weight, blendingMode);
    }
  }

  private _updatePlayingState(
    playingStateData: AnimatorStatePlayData<Component>,
    isFirstLayer: boolean,
    weight: number,
    blendingMode: AnimatorLayerBlendingMode
  ) {
    playingStateData.playState = StatePlayState.Playing;
    const clip = playingStateData.state.clip;
    const curves = clip._curves;
    const frameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
    const { owners } = playingStateData.stateData;
    for (let i = curves.length - 1; i >= 0; i--) {
      const { curve, type, property } = curves[i];
      const value = curve.evaluate(frameTime);
      const { target, defaultValue } = owners[i];
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
    playingStateData: AnimatorStatePlayData<Component>,
    transition: AnimatorStateTransition,
    destStateData: AnimatorStatePlayData<Component>,
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
    const srcOwners = playingStateData.stateData.owners;
    const destOwners = destStateData.stateData.owners;
    for (let i = count - 1; i >= 0; i--) {
      const { curCurveIndex, nextCurveIndex } = mergedCurveIndexList[i];
      if (curCurveIndex >= 0 && nextCurveIndex >= 0) {
        const { curve: curCurve, type, property } = curClip._curves[curCurveIndex];
        const { curve: nextCurve } = nextClip._curves[nextCurveIndex];
        const curFrameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
        const curVal = curCurve.evaluate(curFrameTime);
        const destVal = nextCurve.evaluate(frameTime);
        const { target, defaultValue } = srcOwners[curCurveIndex];
        const calculatedValue = this._getCrossFadeValue(target, type, property, curVal, destVal, crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, 1);
      } else if (curCurveIndex >= 0) {
        const { curve: curCurve, type, property } = curClip._curves[curCurveIndex];
        const { target, defaultValue } = srcOwners[curCurveIndex];
        const curFrameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
        const curVal = curCurve.evaluate(curFrameTime);
        const calculatedValue = this._getCrossFadeValue(target, type, property, defaultValue, curVal, 1 - crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
      } else {
        const { target, defaultValue } = destOwners[nextCurveIndex];
        const { curve, type, property } = nextClip._curves[nextCurveIndex];
        const val = curve.evaluate(frameTime);
        const calculatedValue = this._getCrossFadeValue(target, type, property, defaultValue, val, crossWeight);
        this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
      }
    }
    if (playingStateData.playState === StatePlayState.Finished) {
      animlayerData.srcPlayData = animlayerData.destPlayData;
      animlayerData.srcPlayData.frameTime = frameTime;
      animlayerData.destPlayData = new AnimatorStatePlayData();
    }
  }

  private _updateCrossFadeFromPose(
    transition: AnimatorStateTransition,
    destStateData: AnimatorStatePlayData<Component>,
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
      const { target, type, property, fixedPoseValue, defaultValue } = crossCurveIndex.owner;
      if (crossCurveIndex.nextCurveIndex) {
        const value = curves[i].curve.evaluate(frameTime);
        calculatedValue = this._getCrossFadeValue(target, type, property, fixedPoseValue, value, crossWeight);
      } else {
        calculatedValue = this._getCrossFadeValue(target, type, property, fixedPoseValue, defaultValue, crossWeight);
      }
      this._applyClipValue(target, type, property, defaultValue, calculatedValue, weight);
    }
    if (destStateData.playState === StatePlayState.Playing) {
      animlayerData.srcPlayData = animlayerData.destPlayData;
      animlayerData.srcPlayData.frameTime = frameTime;
      animlayerData.destPlayData = new AnimatorStatePlayData();
    }
  }

  private _revertDefaultValue(playData: AnimatorStatePlayData<Component>) {
    const { clip } = playData.state;
    if (clip) {
      const curves = clip._curves;
      const { owners } = playData.stateData;
      for (let i = curves.length - 1; i >= 0; i--) {
        const owner = owners[i];
        const curve = curves[i];
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
