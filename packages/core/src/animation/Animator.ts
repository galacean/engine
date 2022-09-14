import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { ClassPool } from "../RenderPipeline/ClassPool";
import { AnimatorController } from "./AnimatorController";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { AnimatorStatePlayState } from "./enums/AnimatorStatePlayState";
import { LayerState } from "./enums/LayerState";
import { AnimationCurveOwner } from "./internal/AnimationCurveOwner";
import { AnimationEventHandler } from "./internal/AnimationEventHandler";
import { AnimatorLayerData } from "./internal/AnimatorLayerData";
import { AnimatorStateData } from "./internal/AnimatorStateData";
import { AnimatorStateInfo } from "./internal/AnimatorStateInfo";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";
import { AnimatorTempValue } from "./internal/AnimatorTempValue";
import { CrossCurveData } from "./internal/CrossCurveData";
/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  private static _tempAnimatorInfo: AnimatorStateInfo = new AnimatorStateInfo();

  protected _animatorController: AnimatorController;
  @assignmentClone
  protected _speed: number = 1.0;
  @ignoreClone
  protected _controllerUpdateFlag: BoolUpdateFlag;

  @ignoreClone
  private _animatorLayersData: AnimatorLayerData[] = [];
  @ignoreClone
  private _crossCurveDataCollection: CrossCurveData[] = [];
  @ignoreClone
  private _animationCurveOwners: Record<string, AnimationCurveOwner>[] = [];
  @ignoreClone
  private _crossCurveDataPool: ClassPool<CrossCurveData> = new ClassPool(CrossCurveData);
  @ignoreClone
  private _animationEventHandlerPool: ClassPool<AnimationEventHandler> = new ClassPool(AnimationEventHandler);

  /**
   * The playback speed of the Animator, 1.0 is normal playback speed.
   */
  get speed(): number {
    return this._speed;
  }

  set speed(value: number) {
    this._speed = value;
  }

  /**
   * All layers from the AnimatorController which belongs this Animator.
   */
  get animatorController(): AnimatorController {
    return this._animatorController;
  }

  set animatorController(animatorController: AnimatorController) {
    if (animatorController !== this._animatorController) {
      this._controllerUpdateFlag && this._controllerUpdateFlag.destroy();
      this._controllerUpdateFlag = animatorController && animatorController._registerChangeFlag();
      this._animatorController = animatorController;
    }
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
    if (this._controllerUpdateFlag?.flag) {
      this._clearPlayData();
    }

    const animatorInfo = this._getAnimatorStateInfo(stateName, layerIndex, Animator._tempAnimatorInfo);
    const { state } = animatorInfo;

    if (!state) {
      return;
    }
    if (!state.clip) {
      console.warn(`The state named ${stateName} has no AnimationClip data.`);
      return;
    }
    const animatorLayerData = this._getAnimatorLayerData(animatorInfo.layerIndex);
    const { srcPlayData } = animatorLayerData;
    const { state: curState } = srcPlayData;
    if (curState && curState !== state) {
      this._revertDefaultValue(srcPlayData.state, srcPlayData.stateData);
    }

    //TODO CM: Not consider same stateName, but different animation
    const animatorStateData = this._getAnimatorStateData(stateName, state, animatorLayerData);

    animatorLayerData.layerState = LayerState.Playing;
    srcPlayData.reset(state, animatorStateData, state._getDuration() * normalizedTimeOffset);

    this._saveDefaultValues(animatorStateData);
  }

  /**
   * Create a cross fade from the current state to another state.
   * @param stateName - The state name
   * @param normalizedTransitionDuration - The duration of the transition (normalized)
   * @param layerIndex - The layer index(default -1). If layer is -1, play the first state with the given state name
   * @param normalizedTimeOffset - The time offset between 0 and 1(default 0)
   */
  crossFade(
    stateName: string,
    normalizedTransitionDuration: number,
    layerIndex: number = -1,
    normalizedTimeOffset: number = 0
  ): void {
    if (this._controllerUpdateFlag?.flag) {
      this._clearPlayData();
    }

    const { state } = this._getAnimatorStateInfo(stateName, layerIndex, Animator._tempAnimatorInfo);
    const { manuallyTransition } = this._getAnimatorLayerData(layerIndex);
    manuallyTransition.duration = normalizedTransitionDuration;
    manuallyTransition.offset = normalizedTimeOffset;
    manuallyTransition.destinationState = state;
    this._crossFadeByTransition(manuallyTransition, layerIndex);
  }

  /**
   * Evaluates the animator component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update
   */
  update(deltaTime: number): void {
    if (this.speed === 0) {
      return;
    }

    const { _animatorController: animatorController } = this;
    if (!animatorController) {
      return;
    }
    if (this._controllerUpdateFlag?.flag) {
      return;
    }
    deltaTime *= this.speed;
    for (let i = 0, n = animatorController.layers.length; i < n; i++) {
      const animatorLayerData = this._getAnimatorLayerData(i);
      if (animatorLayerData.layerState === LayerState.Standby) {
        continue;
      }

      this._updateLayer(i, i === 0, deltaTime / 1000);
    }
  }

  /**
   * Get the playing state from the target layerIndex.
   * @param layerIndex - The layer index
   */
  getCurrentAnimatorState(layerIndex: number) {
    return this._animatorLayersData[layerIndex]?.srcPlayData?.state;
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
  _reset(): void {
    const { _animatorController: animatorController } = this;
    if (animatorController) {
      const layers = animatorController.layers;
      for (let i = 0, n = layers.length; i < n; ++i) {
        const { states } = layers[i].stateMachine;
        const animatorLayerData = this._getAnimatorLayerData(i);
        for (let j = 0, m = states.length; j < m; ++j) {
          const state = states[j];
          const animatorStateData = this._getAnimatorStateData(state.name, state, animatorLayerData);
          this._revertDefaultValue(state, animatorStateData);
        }
      }
    }
    this._clearPlayData();
  }

  private _getAnimatorStateInfo(stateName: string, layerIndex: number, out: AnimatorStateInfo): AnimatorStateInfo {
    let state: AnimatorState = null;
    const { _animatorController: animatorController } = this;
    if (animatorController) {
      const layers = animatorController.layers;
      if (layerIndex === -1) {
        for (let i = 0, n = layers.length; i < n; i++) {
          state = layers[i].stateMachine.findStateByName(stateName);
          if (state) {
            layerIndex = i;
            break;
          }
        }
      } else {
        state = layers[layerIndex].stateMachine.findStateByName(stateName);
      }
    }
    out.layerIndex = layerIndex;
    out.state = state;
    return out;
  }

  private _saveDefaultValues(stateData: AnimatorStateData): void {
    const { curveOwners } = stateData;
    for (let i = curveOwners.length - 1; i >= 0; i--) {
      curveOwners[i].saveDefaultValue();
    }
  }

  private _getAnimatorStateData(
    stateName: string,
    animatorState: AnimatorState,
    animatorLayerData: AnimatorLayerData
  ): AnimatorStateData {
    const { animatorStateDataMap: animatorStateDataCollection } = animatorLayerData;
    let animatorStateData = animatorStateDataCollection[stateName];
    if (!animatorStateData) {
      animatorStateData = new AnimatorStateData();
      animatorStateDataCollection[stateName] = animatorStateData;
      this._saveAnimatorStateData(animatorState, animatorStateData);
      this._saveAnimatorEventHandlers(animatorState, animatorStateData);
    }
    return animatorStateData;
  }

  private _saveAnimatorStateData(animatorState: AnimatorState, animatorStateData: AnimatorStateData): void {
    const { entity, _animationCurveOwners: animationCureOwners } = this;
    const { curveOwners } = animatorStateData;
    const { _curveBindings: curves } = animatorState.clip;
    for (let i = curves.length - 1; i >= 0; i--) {
      const curve = curves[i];
      const targetEntity = curve.relativePath === "" ? entity : entity.findByPath(curve.relativePath);
      const { property } = curve;
      const { instanceId } = targetEntity;
      const propertyOwners = animationCureOwners[instanceId] || (animationCureOwners[instanceId] = {});
      curveOwners[i] = propertyOwners[property] || (propertyOwners[property] = curve._createCurveOwner(targetEntity));
    }
  }

  private _saveAnimatorEventHandlers(state: AnimatorState, animatorStateData: AnimatorStateData): void {
    const eventHandlerPool = this._animationEventHandlerPool;
    const scripts = this._entity._scripts;
    const scriptCount = scripts.length;
    const { eventHandlers } = animatorStateData;
    const { events } = state.clip;

    eventHandlerPool.resetPool();
    eventHandlers.length = 0;
    for (let i = 0, n = events.length; i < n; i++) {
      const event = events[i];
      const eventHandler = eventHandlerPool.getFromPool();
      const funcName = event.functionName;
      const { handlers } = eventHandler;

      eventHandler.event = event;
      handlers.length = 0;
      for (let j = scriptCount - 1; j >= 0; j--) {
        const handler = <Function>scripts.get(j)[funcName];
        handler && handlers.push(handler);
      }
      eventHandlers.push(eventHandler);
    }
  }

  private _clearCrossData(animatorLayerData: AnimatorLayerData): void {
    animatorLayerData.crossCurveMark++;
    this._crossCurveDataCollection.length = 0;
    this._crossCurveDataPool.resetPool();
  }

  private _addCrossCurveData(
    crossCurveData: CrossCurveData[],
    owner: AnimationCurveOwner,
    curCurveIndex: number,
    nextCurveIndex: number
  ): void {
    const dataItem = this._crossCurveDataPool.getFromPool();
    dataItem.curveOwner = owner;
    dataItem.srcCurveIndex = curCurveIndex;
    dataItem.destCurveIndex = nextCurveIndex;
    crossCurveData.push(dataItem);
  }

  private _prepareCrossFading(animatorLayerData: AnimatorLayerData): void {
    const crossCurveData = this._crossCurveDataCollection;
    const { crossCurveMark } = animatorLayerData;

    // Add src cross curve data.
    this._prepareSrcCrossData(crossCurveData, animatorLayerData.srcPlayData, crossCurveMark, false);
    // Add dest cross curve data.
    this._prepareDestCrossData(crossCurveData, animatorLayerData.destPlayData, crossCurveMark, false);
  }

  private _prepareStandbyCrossFading(animatorLayerData: AnimatorLayerData): void {
    const crossCurveData = this._crossCurveDataCollection;
    const { srcPlayData, crossCurveMark } = animatorLayerData;

    // Standby have two sub state, one is never play, one is finished, never play srcPlayData.state is null.
    srcPlayData.state && this._prepareSrcCrossData(crossCurveData, srcPlayData, crossCurveMark, true);
    // Add dest cross curve data.
    this._prepareDestCrossData(crossCurveData, animatorLayerData.destPlayData, crossCurveMark, true);
  }

  private _prepareFixedPoseCrossFading(animatorLayerData: AnimatorLayerData): void {
    const crossCurveData = this._crossCurveDataCollection;

    // Save current cross curve data owner fixed pose.
    for (let i = crossCurveData.length - 1; i >= 0; i--) {
      const item = crossCurveData[i];
      item.curveOwner.saveFixedPoseValue();
      // Reset destCurveIndex When fixed pose crossFading again.
      item.destCurveIndex = -1;
    }
    // prepare dest AnimatorState cross data.
    this._prepareDestCrossData(crossCurveData, animatorLayerData.destPlayData, animatorLayerData.crossCurveMark, true);
  }

  private _prepareSrcCrossData(
    crossCurveData: CrossCurveData[],
    srcPlayData: AnimatorStatePlayData,
    crossCurveMark: number,
    saveFixed: boolean
  ): void {
    const { curveOwners } = srcPlayData.stateData;
    for (let i = curveOwners.length - 1; i >= 0; i--) {
      const owner = curveOwners[i];
      owner.crossCurveMark = crossCurveMark;
      owner.crossCurveDataIndex = crossCurveData.length;
      saveFixed && owner.saveFixedPoseValue();
      this._addCrossCurveData(crossCurveData, owner, i, -1);
    }
  }

  private _prepareDestCrossData(
    crossCurveData: CrossCurveData[],
    destPlayData: AnimatorStatePlayData,
    crossCurveMark: number,
    saveFixed: boolean
  ): void {
    const { curveOwners } = destPlayData.stateData;
    for (let i = curveOwners.length - 1; i >= 0; i--) {
      const owner = curveOwners[i];
      if (owner.crossCurveMark === crossCurveMark) {
        crossCurveData[owner.crossCurveDataIndex].destCurveIndex = i;
      } else {
        owner.saveDefaultValue();
        saveFixed && owner.saveFixedPoseValue();
        owner.crossCurveMark = crossCurveMark;
        owner.crossCurveDataIndex = crossCurveData.length;
        this._addCrossCurveData(crossCurveData, owner, -1, i);
      }
    }
  }

  private _getAnimatorLayerData(layerIndex: number): AnimatorLayerData {
    let animatorLayerData = this._animatorLayersData[layerIndex];
    animatorLayerData || (this._animatorLayersData[layerIndex] = animatorLayerData = new AnimatorLayerData());
    return animatorLayerData;
  }

  private _updateLayer(layerIndex: number, firstLayer: boolean, deltaTime: number): void {
    const { blendingMode, weight } = this._animatorController.layers[layerIndex];
    const animLayerData = this._animatorLayersData[layerIndex];
    const { srcPlayData, destPlayData, crossFadeTransition: crossFadeTransitionInfo } = animLayerData;
    const layerAdditive = blendingMode === AnimatorLayerBlendingMode.Additive;
    const layerWeight = firstLayer ? 1.0 : weight;
    //TODO: 任意情况都应该检查，后面要优化
    animLayerData.layerState !== LayerState.FixedCrossFading &&
      this._checkTransition(srcPlayData, crossFadeTransitionInfo, layerIndex);

    switch (animLayerData.layerState) {
      case LayerState.Playing:
        this._updatePlayingState(srcPlayData, animLayerData, layerIndex, layerWeight, deltaTime, layerAdditive);
        break;
      case LayerState.FixedCrossFading:
        this._updateCrossFadeFromPose(destPlayData, animLayerData, layerIndex, layerWeight, deltaTime, layerAdditive);
        break;
      case LayerState.CrossFading:
        this._updateCrossFade(
          srcPlayData,
          destPlayData,
          animLayerData,
          layerIndex,
          layerWeight,
          deltaTime,
          layerAdditive
        );
        break;
    }
  }

  private _updatePlayingState(
    playData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    layerIndex: number,
    weight: number,
    delta: number,
    additive: boolean
  ): void {
    const { curveOwners, eventHandlers } = playData.stateData;
    const { state, playState: lastPlayState, clipTime: lastClipTime } = playData;
    const { _curveBindings: curves } = state.clip;

    playData.update(this.speed < 0);

    const { clipTime, playState } = playData;

    eventHandlers.length && this._fireAnimationEvents(playData, eventHandlers, lastClipTime, clipTime);

    for (let i = curves.length - 1; i >= 0; i--) {
      const owner = curveOwners[i];
      const { curve } = curves[i];
      if (additive) {
        owner.evaluateAndApplyAdditiveValue(curve, clipTime, weight);
      } else {
        owner.evaluateAndApplyValue(curve, clipTime, weight);
      }
    }

    playData.frameTime += state.speed * delta;

    if (playState === AnimatorStatePlayState.Finished) {
      layerData.layerState = LayerState.Standby;
    }

    if (lastPlayState === AnimatorStatePlayState.UnStarted) {
      this._callAnimatorScriptOnEnter(state, layerIndex);
    }
    if (playState === AnimatorStatePlayState.Finished) {
      this._callAnimatorScriptOnExit(state, layerIndex);
    } else {
      this._callAnimatorScriptOnUpdate(state, layerIndex);
    }
  }

  private _updateCrossFade(
    srcPlayData: AnimatorStatePlayData,
    destPlayData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    layerIndex,
    weight: number,
    delta: number,
    additive: boolean
  ) {
    const { _crossCurveDataCollection: crossCurveDataCollection } = this;
    const { _curveBindings: srcCurves } = srcPlayData.state.clip;
    const { state: srcState, stateData: srcStateData, playState: lastSrcPlayState } = srcPlayData;
    const { eventHandlers: srcEventHandlers } = srcStateData;
    const { state: destState, stateData: destStateData, playState: lastDstPlayState } = destPlayData;
    const { eventHandlers: destEventHandlers } = destStateData;
    const { _curveBindings: destCurves } = destState.clip;
    const { clipTime: lastSrcClipTime } = srcPlayData;
    const { clipTime: lastDestClipTime } = destPlayData;

    let crossWeight =
      Math.abs(destPlayData.frameTime) / (destState._getDuration() * layerData.crossFadeTransition.duration);
    crossWeight >= 1.0 && (crossWeight = 1.0);

    srcPlayData.update(this.speed < 0);
    destPlayData.update(this.speed < 0);

    const { playState: srcPlayState } = srcPlayData;
    const { playState: destPlayState } = destPlayData;

    this._updateCrossFadeData(layerData, crossWeight, delta, false);

    const { clipTime: srcClipTime } = srcPlayData;
    const { clipTime: destClipTime } = destPlayData;

    srcEventHandlers.length && this._fireAnimationEvents(srcPlayData, srcEventHandlers, lastSrcClipTime, srcClipTime);
    destEventHandlers.length &&
      this._fireAnimationEvents(destPlayData, destEventHandlers, lastDestClipTime, destClipTime);

    if (lastSrcPlayState === AnimatorStatePlayState.UnStarted) {
      this._callAnimatorScriptOnEnter(srcState, layerIndex);
    }
    if (crossWeight === 1 || srcPlayState === AnimatorStatePlayState.Finished) {
      this._callAnimatorScriptOnExit(srcState, layerIndex);
    } else {
      this._callAnimatorScriptOnUpdate(srcState, layerIndex);
    }

    if (lastDstPlayState === AnimatorStatePlayState.UnStarted) {
      this._callAnimatorScriptOnEnter(destState, layerIndex);
    }
    if (destPlayState === AnimatorStatePlayState.Finished) {
      this._callAnimatorScriptOnExit(destState, layerIndex);
    } else {
      this._callAnimatorScriptOnUpdate(destState, layerIndex);
    }

    for (let i = crossCurveDataCollection.length - 1; i >= 0; i--) {
      const { curveOwner, srcCurveIndex, destCurveIndex } = crossCurveDataCollection[i];
      curveOwner.crossFadeAndApplyValue(
        srcCurves[srcCurveIndex]?.curve,
        destCurves[destCurveIndex]?.curve,
        srcClipTime,
        destClipTime,
        crossWeight,
        weight,
        additive
      );
    }
  }

  private _updateCrossFadeFromPose(
    destPlayData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    layerIndex: number,
    layerWeight: number,
    delta: number,
    additive: boolean
  ) {
    const crossCurveDataCollection = this._crossCurveDataCollection;
    const { state, stateData, playState: lastPlayState } = destPlayData;
    const { eventHandlers } = stateData;
    const { _curveBindings: curves } = state.clip;
    const { clipTime: lastDestClipTime } = destPlayData;

    let crossWeight =
      Math.abs(destPlayData.frameTime) / (state._getDuration() * layerData.crossFadeTransition.duration);
    crossWeight >= 1.0 && (crossWeight = 1.0);

    destPlayData.update(this.speed < 0);

    const { playState } = destPlayData;

    this._updateCrossFadeData(layerData, crossWeight, delta, true);

    const { clipTime: destClipTime } = destPlayData;
    //TODO: srcState 少了最新一段时间的判断
    eventHandlers.length && this._fireAnimationEvents(destPlayData, eventHandlers, lastDestClipTime, destClipTime);

    if (lastPlayState === AnimatorStatePlayState.UnStarted) {
      this._callAnimatorScriptOnEnter(state, layerIndex);
    }
    if (playState === AnimatorStatePlayState.Finished) {
      this._callAnimatorScriptOnExit(state, layerIndex);
    } else {
      this._callAnimatorScriptOnUpdate(state, layerIndex);
    }

    for (let i = crossCurveDataCollection.length - 1; i >= 0; i--) {
      const { curveOwner, destCurveIndex } = crossCurveDataCollection[i];
      curveOwner.crossFadeFromPoseAndApplyValue(
        curves[destCurveIndex]?.curve,
        destClipTime,
        crossWeight,
        layerWeight,
        additive
      );
    }
  }

  private _updateCrossFadeData(layerData: AnimatorLayerData, crossWeight: number, delta: number, fixed: boolean): void {
    const { destPlayData } = layerData;
    destPlayData.frameTime += destPlayData.state.speed * delta;
    if (crossWeight === 1.0) {
      if (destPlayData.playState === AnimatorStatePlayState.Finished) {
        layerData.layerState = LayerState.Standby;
      } else {
        layerData.layerState = LayerState.Playing;
      }
      layerData.switchPlayData();
    } else {
      fixed || (layerData.srcPlayData.frameTime += layerData.srcPlayData.state.speed * delta);
    }
  }

  private _revertDefaultValue(state: AnimatorState, stateData: AnimatorStateData) {
    const { clip } = state;
    if (clip) {
      const curves = clip._curveBindings;
      const { curveOwners } = stateData;
      for (let i = curves.length - 1; i >= 0; i--) {
        curveOwners[i].revertDefaultValue();
      }
    }
  }

  private _checkTransition(
    stateData: AnimatorStatePlayData,
    crossFadeTransition: AnimatorStateTransition,
    layerIndex: number
  ) {
    const { state, clipTime } = stateData;
    const duration = state._getDuration();
    const { transitions } = state;
    for (let i = 0, n = transitions.length; i < n; ++i) {
      const transition = transitions[i];
      if (duration * transition.exitTime <= clipTime) {
        crossFadeTransition !== transition && this._crossFadeByTransition(transition, layerIndex);
      }
    }
  }

  private _crossFadeByTransition(transition: AnimatorStateTransition, layerIndex: number): void {
    const { name } = transition.destinationState;
    const animatorStateInfo = this._getAnimatorStateInfo(name, layerIndex, Animator._tempAnimatorInfo);
    const { state: crossState } = animatorStateInfo;
    if (!crossState) {
      return;
    }
    if (!crossState.clip) {
      console.warn(`The state named ${name} has no AnimationClip data.`);
      return;
    }

    const animatorLayerData = this._getAnimatorLayerData(animatorStateInfo.layerIndex);
    const layerState = animatorLayerData.layerState;
    const { destPlayData } = animatorLayerData;

    const animatorStateData = this._getAnimatorStateData(name, crossState, animatorLayerData);
    const duration = crossState._getDuration();
    const offset = duration * transition.offset;
    destPlayData.reset(crossState, animatorStateData, offset);

    switch (layerState) {
      // Maybe not play, maybe end.
      case LayerState.Standby:
        animatorLayerData.layerState = LayerState.FixedCrossFading;
        this._clearCrossData(animatorLayerData);
        this._prepareStandbyCrossFading(animatorLayerData);
        break;
      case LayerState.Playing:
        animatorLayerData.layerState = LayerState.CrossFading;
        this._clearCrossData(animatorLayerData);
        this._prepareCrossFading(animatorLayerData);
        break;
      case LayerState.CrossFading:
        animatorLayerData.layerState = LayerState.FixedCrossFading;
        this._prepareFixedPoseCrossFading(animatorLayerData);
        break;
      case LayerState.FixedCrossFading:
        this._prepareFixedPoseCrossFading(animatorLayerData);
        break;
    }

    animatorLayerData.crossFadeTransition = transition;
  }

  private _fireAnimationEvents(
    playState: AnimatorStatePlayData,
    eventHandlers: AnimationEventHandler[],
    lastClipTime: number,
    clipTime: number
  ): void {
    const { state } = playState;
    const clipDuration = state.clip.length;
    if (this.speed >= 0) {
      if (clipTime < lastClipTime) {
        this._fireSubAnimationEvents(playState, eventHandlers, lastClipTime, state.clipEndTime * clipDuration);
        playState.currentEventIndex = 0;
        this._fireSubAnimationEvents(playState, eventHandlers, state.clipStartTime * clipDuration, clipTime);
      } else {
        this._fireSubAnimationEvents(playState, eventHandlers, lastClipTime, clipTime);
      }
    } else {
      if (clipTime > lastClipTime) {
        this._fireBackwardSubAnimationEvents(
          playState,
          eventHandlers,
          lastClipTime,
          state.clipStartTime * clipDuration
        );
        playState.currentEventIndex = eventHandlers.length - 1;
        this._fireBackwardSubAnimationEvents(playState, eventHandlers, state.clipEndTime * clipDuration, clipTime);
      } else {
        this._fireBackwardSubAnimationEvents(playState, eventHandlers, lastClipTime, clipTime);
      }
    }
  }

  private _fireSubAnimationEvents(
    playState: AnimatorStatePlayData,
    eventHandlers: AnimationEventHandler[],
    lastClipTime: number,
    curClipTime: number
  ): void {
    let eventIndex = playState.currentEventIndex;
    for (let n = eventHandlers.length; eventIndex < n; eventIndex++) {
      const eventHandler = eventHandlers[eventIndex];
      const { time, parameter } = eventHandler.event;

      if (time > curClipTime) {
        break;
      }

      const { handlers } = eventHandler;
      if (time >= lastClipTime) {
        for (let j = handlers.length - 1; j >= 0; j--) {
          handlers[j](parameter);
        }
        playState.currentEventIndex = Math.min(eventIndex + 1, n - 1);
      }
    }
  }

  private _fireBackwardSubAnimationEvents(
    playState: AnimatorStatePlayData,
    eventHandlers: AnimationEventHandler[],
    lastClipTime: number,
    curClipTime: number
  ): void {
    let eventIndex = playState.currentEventIndex;
    for (; eventIndex >= 0; eventIndex--) {
      const eventHandler = eventHandlers[eventIndex];
      const { time, parameter } = eventHandler.event;

      if (time < curClipTime) {
        break;
      }

      const { handlers } = eventHandler;
      if (time <= lastClipTime) {
        for (let j = handlers.length - 1; j >= 0; j--) {
          handlers[j](parameter);
        }
        playState.currentEventIndex = Math.max(eventIndex - 1, 0);
      }
    }
  }

  private _callAnimatorScriptOnEnter(state: AnimatorState, layerIndex: number): void {
    const scripts = state._onStateEnterScripts;
    for (let i = 0, n = scripts.length; i < n; i++) {
      scripts[i].onStateEnter(this, state, layerIndex);
    }
  }

  private _callAnimatorScriptOnUpdate(state: AnimatorState, layerIndex: number): void {
    const scripts = state._onStateUpdateScripts;
    for (let i = 0, n = scripts.length; i < n; i++) {
      scripts[i].onStateUpdate(this, state, layerIndex);
    }
  }

  private _callAnimatorScriptOnExit(state: AnimatorState, layerIndex: number): void {
    const scripts = state._onStateExitScripts;
    for (let i = 0, n = scripts.length; i < n; i++) {
      scripts[i].onStateExit(this, state, layerIndex);
    }
  }

  private _clearPlayData(): void {
    this._animatorLayersData.length = 0;
    this._crossCurveDataCollection.length = 0;
    this._animationCurveOwners.length = 0;
    if (this._controllerUpdateFlag) {
      this._controllerUpdateFlag.flag = false;
    }
  }
}
