import { AnimatorStateMachine } from "./AnimatorStateMachine";
import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { Renderer } from "../Renderer";
import { ClassPool } from "../RenderPipeline/ClassPool";
import { AnimatorController } from "./AnimatorController";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorStateTransition";
import { AnimatorCullingMode } from "./enums/AnimatorCullingMode";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { AnimatorStatePlayState } from "./enums/AnimatorStatePlayState";
import { StateMachineState } from "./enums/StateMachineState";
import { AnimationCurveOwner } from "./internal/animationCurveOwner/AnimationCurveOwner";
import { AnimationEventHandler } from "./internal/AnimationEventHandler";
import { AnimatorStateMachineData } from "./internal/AnimatorStateMachineData";
import { AnimatorStateData } from "./internal/AnimatorStateData";
import { AnimatorStatePlayData } from "./AnimatorStatePlayData";
import { KeyframeValueType } from "./Keyframe";
import { AnimatorLayerData } from "./internal/AnimatorLayerData";

interface IAnimatorStateInfo {
  layerIndex: number;
  state: AnimatorState;
}

interface IAnimatorStateMachineInfo {
  layerIndex: number;
  stateMachine: AnimatorStateMachine;
}

interface StateSeekedInfo {
  state: AnimatorState;
  time: number;
  stateMachineData: AnimatorStateMachineData;
}

/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  /** Culling mode of this Animator. */
  cullingMode: AnimatorCullingMode = AnimatorCullingMode.None;
  /** The playback speed of the Animator, 1.0 is normal playback speed. */
  @assignmentClone
  speed: number = 1.0;

  protected _animatorController: AnimatorController;

  @ignoreClone
  protected _controllerUpdateFlag: BoolUpdateFlag;

  @ignoreClone
  private _animatorLayersData: AnimatorLayerData[] = [];
  @ignoreClone
  private _crossOwnerCollection: AnimationCurveOwner<KeyframeValueType>[] = [];
  @ignoreClone
  private _animationCurveOwners: Record<string, AnimationCurveOwner<KeyframeValueType>>[] = [];
  @ignoreClone
  private _animationEventHandlerPool: ClassPool<AnimationEventHandler> = new ClassPool(AnimationEventHandler);

  @ignoreClone
  private _tempAnimatorStateInfo: IAnimatorStateInfo = { layerIndex: -1, state: null };
  @ignoreClone
  private _tempAnimatorStateMachineInfo: IAnimatorStateMachineInfo = { layerIndex: -1, stateMachine: null };

  @ignoreClone
  private _controlledRenderers: Renderer[] = [];

  /**
   * All layers from the AnimatorController which belongs this Animator.
   */
  get animatorController(): AnimatorController {
    return this._animatorController;
  }

  set animatorController(animatorController: AnimatorController) {
    if (animatorController !== this._animatorController) {
      this._reset();
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
    this._reset();

    const stateInfo = this._getAnimatorStateInfo(stateName, layerIndex);
    const { state, layerIndex: seekedLayerIndex } = stateInfo;

    if (state) {
      if (!state.clip) {
        console.warn(`The state named ${stateName} has no AnimationClip data.`);
        return;
      }
      const animatorLayerData = this._getAnimatorLayerData(seekedLayerIndex);
      const stateMachineData = animatorLayerData.getAnimatorStateMachineData(
        "",
        this.animatorController.layers[seekedLayerIndex].stateMachine
      );

      animatorLayerData.currentStateMachineData = stateMachineData;
      this._playState(state, animatorLayerData, normalizedTimeOffset);
    } else {
      const stateMachineInfo = this._getAnimatorStateMachineInfo(stateName, layerIndex);
      const { stateMachine, layerIndex: seekedLayerIndex } = stateMachineInfo;
      if (stateMachine) {
        this._playStateMachine(stateMachine, seekedLayerIndex, normalizedTimeOffset);
      }
    }
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
    this._reset();

    const stateInfo = this._getAnimatorStateInfo(stateName, layerIndex);
    const { state, layerIndex: seekedLayerIndex } = stateInfo;

    if (state) {
      if (!state.clip) {
        console.warn(`The state named ${stateName} has no AnimationClip data.`);
        return;
      }
      const animatorLayerData = this._getAnimatorLayerData(seekedLayerIndex);
      const stateMachineData = animatorLayerData.getAnimatorStateMachineData(
        "",
        this.animatorController.layers[stateInfo.layerIndex].stateMachine
      );

      animatorLayerData.currentStateMachineData = stateMachineData;
      this._crossFadeState(
        state,
        seekedLayerIndex,
        stateMachineData,
        normalizedTransitionDuration,
        normalizedTimeOffset
      );
    } else {
      const stateMachineInfo = this._getAnimatorStateMachineInfo(stateName, layerIndex);
      const { stateMachine, layerIndex: seekedLayerIndex } = stateMachineInfo;
      if (stateMachine) {
        this._crossFadeStateMachine(stateMachine, seekedLayerIndex, normalizedTransitionDuration, normalizedTimeOffset);
      }
    }
  }

  /**
   * Evaluates the animator component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update
   */
  update(deltaTime: number): void {
    let animationUpdate: boolean;
    if (this.cullingMode === AnimatorCullingMode.Complete) {
      animationUpdate = false;
      const controlledRenderers = this._controlledRenderers;
      for (let i = 0, n = controlledRenderers.length; i < n; i++) {
        if (!controlledRenderers[i].isCulled) {
          animationUpdate = true;
          break;
        }
      }
    } else {
      animationUpdate = true;
    }

    const { _animatorController: animatorController } = this;
    if (!animatorController) {
      return;
    }
    if (this._controllerUpdateFlag?.flag) {
      this._checkAutoPlay();
      return;
    }

    deltaTime *= this.speed;
    for (let i = 0, n = animatorController.layers.length; i < n; i++) {
      const animatorLayerData = this._getAnimatorLayerData(i);
      const { currentStateMachineData } = animatorLayerData;
      if (!currentStateMachineData || currentStateMachineData.stateMachineState === StateMachineState.Standby) {
        continue;
      }

      this._updateLayer(i, i === 0, deltaTime / 1000, animationUpdate);
    }
  }

  /**
   * Get the playing state from the target layerIndex.
   * @param layerIndex - The layer index
   */
  getCurrentAnimatorState(layerIndex: number): AnimatorState {
    return this._animatorLayersData[layerIndex].currentStateMachineData?.srcPlayData?.state;
  }

  /**
   * Get the state by name.
   * @param stateName - The state name
   * @param layerIndex - The layer index(default -1). If layer is -1, find the first state with the given state name
   */
  findAnimatorState(stateName: string, layerIndex: number = -1): AnimatorState {
    return this._getAnimatorStateInfo(stateName, layerIndex).state;
  }

  /**
   * @override
   * @internal
   */
  _onEnable(): void {
    this.engine._componentsManager.addOnUpdateAnimations(this);
    this.animatorController && this._checkAutoPlay();
    this._entity.getComponentsIncludeChildren(Renderer, this._controlledRenderers);
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
    const { _animationCurveOwners: animationCurveOwners } = this;
    for (let instanceId in animationCurveOwners) {
      const propertyOwners = animationCurveOwners[instanceId];
      for (let property in propertyOwners) {
        const owner = propertyOwners[property];
        owner.hasSavedDefaultValue && owner.revertDefaultValue();
      }
    }

    this._animatorLayersData.length = 0;
    this._crossOwnerCollection.length = 0;
    this._animationCurveOwners.length = 0;
    this._animationEventHandlerPool.resetPool();

    if (this._controllerUpdateFlag) {
      this._controllerUpdateFlag.flag = false;
    }
  }

  private _getAnimatorStateInfo(stateName: string, layerIndex: number): IAnimatorStateInfo {
    const { _animatorController: animatorController, _tempAnimatorStateInfo: stateInfo } = this;
    let state: AnimatorState = null;
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
    stateInfo.layerIndex = layerIndex;
    stateInfo.state = state;
    return stateInfo;
  }

  private _getAnimatorStateMachineInfo(stateMachineName: string, layerIndex: number): IAnimatorStateMachineInfo {
    const { _animatorController: animatorController, _tempAnimatorStateMachineInfo: stateMachineInfo } = this;
    let stateMachine: AnimatorStateMachine = null;
    if (animatorController) {
      const layers = animatorController.layers;
      if (layerIndex === -1) {
        for (let i = 0, n = layers.length; i < n; i++) {
          stateMachine = layers[i].stateMachine.findStateMachineByName(stateMachineName);
          if (stateMachine) {
            layerIndex = i;
            break;
          }
        }
      } else {
        stateMachine = layers[layerIndex].stateMachine.findStateMachineByName(stateMachineName);
      }
    }
    stateMachineInfo.layerIndex = layerIndex;
    stateMachineInfo.stateMachine = stateMachine;
    return stateMachineInfo;
  }

  private _saveDefaultValues(stateData: AnimatorStateData): void {
    const { curveOwners } = stateData;
    for (let i = curveOwners.length - 1; i >= 0; i--) {
      curveOwners[i]?.saveDefaultValue();
    }
  }

  private _getAnimatorStateData(
    stateName: string,
    animatorState: AnimatorState,
    animatorLayerData: AnimatorLayerData
  ): AnimatorStateData {
    const { currentStateMachineData } = animatorLayerData;
    const { animatorStateDataMap } = currentStateMachineData;
    let animatorStateData = animatorStateDataMap[stateName];
    if (!animatorStateData) {
      animatorStateData = new AnimatorStateData();
      animatorStateDataMap[stateName] = animatorStateData;
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
      if (targetEntity) {
        const { property } = curve;
        const { instanceId } = targetEntity;
        const propertyOwners = animationCureOwners[instanceId] || (animationCureOwners[instanceId] = {});
        curveOwners[i] = propertyOwners[property] || (propertyOwners[property] = curve._createCurveOwner(targetEntity));
      } else {
        curveOwners[i] = null;
        console.warn(`The entity don\'t have the child entity which path is ${curve.relativePath}.`);
      }
    }
  }

  private _saveAnimatorEventHandlers(state: AnimatorState, animatorStateData: AnimatorStateData): void {
    const eventHandlerPool = this._animationEventHandlerPool;
    const scripts = this._entity._scripts;
    const scriptCount = scripts.length;
    const { eventHandlers } = animatorStateData;
    const { events } = state.clip;

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

  private _clearCrossData(stateMachineData: AnimatorStateMachineData): void {
    stateMachineData.crossCurveMark++;
    this._crossOwnerCollection.length = 0;
  }

  private _addCrossCurveData(
    crossCurveData: AnimationCurveOwner<KeyframeValueType>[],
    owner: AnimationCurveOwner<KeyframeValueType>,
    curCurveIndex: number,
    nextCurveIndex: number
  ): void {
    owner.crossSrcCurveIndex = curCurveIndex;
    owner.crossDestCurveIndex = nextCurveIndex;
    crossCurveData.push(owner);
  }

  private _prepareCrossFading(animatorStateMachineData: AnimatorStateMachineData): void {
    const crossCurveData = this._crossOwnerCollection;
    const { crossCurveMark } = animatorStateMachineData;

    // Add src cross curve data.
    this._prepareSrcCrossData(crossCurveData, animatorStateMachineData.srcPlayData, crossCurveMark, false);
    // Add dest cross curve data.
    this._prepareDestCrossData(crossCurveData, animatorStateMachineData.destPlayData, crossCurveMark, false);
  }

  private _prepareStandbyCrossFading(stateMachineData: AnimatorStateMachineData): void {
    const crossOwnerCollection = this._crossOwnerCollection;
    const { srcPlayData, crossCurveMark } = stateMachineData;

    // Standby have two sub state, one is never play, one is finished, never play srcPlayData.state is null.
    srcPlayData.state && this._prepareSrcCrossData(crossOwnerCollection, srcPlayData, crossCurveMark, true);
    // Add dest cross curve data.
    this._prepareDestCrossData(crossOwnerCollection, stateMachineData.destPlayData, crossCurveMark, true);
  }

  private _prepareFixedPoseCrossFading(stateMachineData: AnimatorStateMachineData): void {
    const crossOwnerCollection = this._crossOwnerCollection;

    // Save current cross curve data owner fixed pose.
    for (let i = crossOwnerCollection.length - 1; i >= 0; i--) {
      const item = crossOwnerCollection[i];
      item.saveFixedPoseValue();
      // Reset destCurveIndex When fixed pose crossFading again.
      item.crossDestCurveIndex = -1;
    }
    // prepare dest AnimatorState cross data.
    this._prepareDestCrossData(
      crossOwnerCollection,
      stateMachineData.destPlayData,
      stateMachineData.crossCurveMark,
      true
    );
  }

  private _prepareSrcCrossData(
    crossCurveData: AnimationCurveOwner<KeyframeValueType>[],
    srcPlayData: AnimatorStatePlayData,
    crossCurveMark: number,
    saveFixed: boolean
  ): void {
    const { curveOwners } = srcPlayData.stateData;
    for (let i = curveOwners.length - 1; i >= 0; i--) {
      const owner = curveOwners[i];
      if (!owner) continue;
      owner.crossCurveMark = crossCurveMark;
      owner.crossCurveDataIndex = crossCurveData.length;
      saveFixed && owner.saveFixedPoseValue();
      this._addCrossCurveData(crossCurveData, owner, i, -1);
    }
  }

  private _prepareDestCrossData(
    crossCurveData: AnimationCurveOwner<KeyframeValueType>[],
    destPlayData: AnimatorStatePlayData,
    crossCurveMark: number,
    saveFixed: boolean
  ): void {
    const { curveOwners } = destPlayData.stateData;
    for (let i = curveOwners.length - 1; i >= 0; i--) {
      const owner = curveOwners[i];
      if (!owner) continue;
      if (owner.crossCurveMark === crossCurveMark) {
        crossCurveData[owner.crossCurveDataIndex].crossDestCurveIndex = i;
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

  private _updateLayer(layerIndex: number, firstLayer: boolean, deltaTime: number, aniUpdate: boolean): void {
    let { blendingMode, weight } = this._animatorController.layers[layerIndex];
    const layerData = this._animatorLayersData[layerIndex];
    const { currentStateMachineData } = layerData;
    const { srcPlayData } = currentStateMachineData;
    const { clipTime: lastClipTime, stateData } = srcPlayData;
    const { eventHandlers } = stateData || {};
    const additive = blendingMode === AnimatorLayerBlendingMode.Additive;
    firstLayer && (weight = 1.0);

    srcPlayData.update(this.speed < 0);

    eventHandlers?.length && this._fireAnimationEvents(srcPlayData, eventHandlers, lastClipTime, srcPlayData.clipTime);

    this._checkTransition(
      srcPlayData,
      currentStateMachineData.crossFadeTransition,
      layerIndex,
      lastClipTime,
      this.speed < 0
    );
    this._doUpdateLayer(layerData, layerIndex, weight, deltaTime, additive, aniUpdate);
  }

  private _doUpdateLayer(
    layerData: AnimatorLayerData,
    layerIndex: number,
    weight: number,
    deltaTime: number,
    additive: boolean,
    aniUpdate: boolean
  ) {
    const { currentStateMachineData } = layerData;
    const { srcPlayData, destPlayData } = currentStateMachineData;

    switch (layerData.currentStateMachineData.stateMachineState) {
      case StateMachineState.Playing:
        this._updatePlayingState(
          srcPlayData,
          currentStateMachineData,
          layerIndex,
          weight,
          deltaTime,
          additive,
          aniUpdate
        );
        break;
      case StateMachineState.FixedCrossFading:
        this._updateCrossFadeFromPose(
          destPlayData,
          currentStateMachineData,
          layerIndex,
          weight,
          deltaTime,
          additive,
          aniUpdate
        );
        break;
      case StateMachineState.CrossFading:
        this._updateCrossFade(
          srcPlayData,
          destPlayData,
          currentStateMachineData,
          layerIndex,
          weight,
          deltaTime,
          additive,
          aniUpdate
        );
        break;
    }
  }

  private _updatePlayingState(
    playData: AnimatorStatePlayData,
    stateMachineData: AnimatorStateMachineData,
    layerIndex: number,
    weight: number,
    delta: number,
    additive: boolean,
    aniUpdate: boolean
  ): void {
    const { curveOwners } = playData.stateData;
    const { state, playState: lastPlayState } = playData;
    const { _curveBindings: curveBindings } = state.clip;

    if (!aniUpdate) {
      return;
    }

    const { clipTime, playState } = playData;

    for (let i = curveBindings.length - 1; i >= 0; i--) {
      const owner = curveOwners[i];
      owner?.evaluateAndApplyValue(curveBindings[i].curve, clipTime, weight, additive);
    }

    playData.frameTime += state.speed * delta;

    if (playState === AnimatorStatePlayState.Finished) {
      stateMachineData.stateMachineState = StateMachineState.Standby;
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
    stateMachineData: AnimatorStateMachineData,
    layerIndex: number,
    weight: number,
    delta: number,
    additive: boolean,
    aniUpdate: boolean
  ) {
    const { _crossOwnerCollection: crossCurveDataCollection } = this;
    const { _curveBindings: srcCurves } = srcPlayData.state.clip;
    const { state: srcState, playState: lastSrcPlayState } = srcPlayData;
    const { state: destState, stateData: destStateData, playState: lastDstPlayState } = destPlayData;
    const { eventHandlers: destEventHandlers } = destStateData;
    const { _curveBindings: destCurves } = destState.clip;
    const { clipTime: lastDestClipTime } = destPlayData;

    let crossWeight =
      Math.abs(destPlayData.frameTime) / (destState.getDuration() * stateMachineData.crossFadeTransition.duration);

    crossWeight >= 1.0 && (crossWeight = 1.0);

    destPlayData.update(this.speed < 0);

    const { playState: srcPlayState } = srcPlayData;
    const { playState: destPlayState } = destPlayData;

    this._updateCrossFadeData(stateMachineData, crossWeight, delta, false);

    if (!aniUpdate) {
      return;
    }

    const { clipTime: srcClipTime } = srcPlayData;
    const { clipTime: destClipTime } = destPlayData;

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
      const crossCurveData = crossCurveDataCollection[i];
      const { crossSrcCurveIndex, crossDestCurveIndex } = crossCurveData;
      crossCurveData.crossFadeAndApplyValue(
        crossSrcCurveIndex >= 0 ? srcCurves[crossSrcCurveIndex].curve : null,
        crossDestCurveIndex >= 0 ? destCurves[crossDestCurveIndex].curve : null,
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
    stateMachineData: AnimatorStateMachineData,
    layerIndex: number,
    layerWeight: number,
    delta: number,
    additive: boolean,
    aniUpdate: boolean
  ) {
    const crossCurveDataCollection = this._crossOwnerCollection;
    const { state, stateData, playState: lastPlayState } = destPlayData;
    const { eventHandlers } = stateData;
    const { _curveBindings: curveBindings } = state.clip;
    const { clipTime: lastDestClipTime } = destPlayData;

    let crossWeight =
      Math.abs(destPlayData.frameTime) / (state.getDuration() * stateMachineData.crossFadeTransition.duration);
    crossWeight >= 1.0 && (crossWeight = 1.0);

    destPlayData.update(this.speed < 0);

    const { playState } = destPlayData;

    this._updateCrossFadeData(stateMachineData, crossWeight, delta, true);

    if (!aniUpdate) {
      return;
    }

    const { clipTime: destClipTime } = destPlayData;

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
      const crossCurveData = crossCurveDataCollection[i];
      const { crossDestCurveIndex } = crossCurveData;
      crossCurveData.crossFadeFromPoseAndApplyValue(
        crossDestCurveIndex >= 0 ? curveBindings[crossDestCurveIndex].curve : null,
        destClipTime,
        crossWeight,
        layerWeight,
        additive
      );
    }
  }

  private _updateCrossFadeData(
    stateMachineData: AnimatorStateMachineData,
    crossWeight: number,
    delta: number,
    fixed: boolean
  ): void {
    const { destPlayData } = stateMachineData;
    destPlayData.frameTime += destPlayData.state.speed * delta;
    if (crossWeight === 1.0) {
      if (destPlayData.playState === AnimatorStatePlayState.Finished) {
        stateMachineData.stateMachineState = StateMachineState.Standby;
      } else {
        stateMachineData.stateMachineState = StateMachineState.Playing;
      }
      stateMachineData.switchPlayData();
      stateMachineData.crossFadeTransition = null;
    } else {
      fixed || (stateMachineData.srcPlayData.frameTime += stateMachineData.srcPlayData.state.speed * delta);
    }
  }

  private _preparePlay(layerData: AnimatorLayerData, playState: AnimatorState, playStateData: AnimatorStateData): void {
    const { currentStateMachineData } = layerData;
    if (currentStateMachineData.stateMachineState === StateMachineState.Playing) {
      const srcPlayData = currentStateMachineData.srcPlayData;
      if (srcPlayData.state !== playState) {
        const { curveOwners } = srcPlayData.stateData;
        for (let i = curveOwners.length - 1; i >= 0; i--) {
          const owner = curveOwners[i];
          owner?.hasSavedDefaultValue && owner.revertDefaultValue();
        }
        this._saveDefaultValues(playStateData);
      }
    } else {
      // layerState is CrossFading, FixedCrossFading, Standby
      const crossCurveDataCollection = this._crossOwnerCollection;
      for (let i = crossCurveDataCollection.length - 1; i >= 0; i--) {
        const owner = crossCurveDataCollection[i];
        owner.hasSavedDefaultValue && owner.revertDefaultValue();
      }
      this._saveDefaultValues(playStateData);
    }
  }

  private _checkTransition(
    stateData: AnimatorStatePlayData,
    crossFadeTransition: AnimatorStateTransition,
    layerIndex: number,
    lastClipTime: number,
    isBackwards: boolean
  ) {
    const { state, clipTime } = stateData;
    if (!state) return;
    const { transitions } = state;
    const duration = state.getDuration();
    for (let i = 0, n = transitions.length; i < n; ++i) {
      const transition = transitions[i];
      if (isBackwards) {
        if (duration * transition.exitTime >= clipTime || clipTime > lastClipTime) {
          if (!crossFadeTransition) {
            const offsetTime =
              clipTime > lastClipTime ? duration + duration * transition.exitTime : duration * transition.exitTime;
            this._crossFadeByTransition(transition, layerIndex, offsetTime - clipTime);
          }
        }
      } else {
        if (duration * transition.exitTime <= clipTime || clipTime < lastClipTime) {
          if (!crossFadeTransition) {
            const offsetTime =
              clipTime < lastClipTime ? duration - duration * transition.exitTime : -duration * transition.exitTime;
            this._crossFadeByTransition(transition, layerIndex, clipTime + offsetTime);
          }
        }
      }
    }
  }

  private _crossFadeByTransition(transition: AnimatorStateTransition, layerIndex: number, offsetTime: number): void {
    const { destinationState } = transition;
    const animatorLayerData = this._getAnimatorLayerData(layerIndex);
    let crossState: AnimatorState;

    crossState = destinationState;

    while (crossState?.name === "Exit") {
      const currentPath = animatorLayerData.currentStateMachineData.path;
      const stateMachine = animatorLayerData.stateMachineMap[currentPath];
      const destinationState = stateMachine.transitions[0]?.destinationState;
      const stateMachineData = animatorLayerData.popStateMachineData();
      if (!stateMachineData) return;
      if (destinationState) {
        crossState = destinationState;
      } else {
        const newStateMachine = stateMachine.transitions[0]?.destinationStateMachine;
        if (newStateMachine) {
          animatorLayerData.pushStateMachineData(newStateMachine);
          crossState = newStateMachine?.defaultState;
        }
      }
    }
    if (!crossState) {
      const stateMachine = transition.destinationStateMachine;
      if (stateMachine) {
        animatorLayerData.pushStateMachineData(stateMachine);
        crossState = stateMachine?.defaultState;
      }
    }

    if (!crossState) {
      return;
    }

    const animatorStateData = this._getAnimatorStateData(crossState.name, crossState, animatorLayerData);

    const { currentStateMachineData } = animatorLayerData;
    const { stateMachineState, destPlayData } = currentStateMachineData;

    const duration = crossState.getDuration();
    const offset = duration * transition.offset + offsetTime;
    destPlayData.reset(crossState, animatorStateData, offset);
    switch (stateMachineState) {
      // Maybe not play, maybe end.
      case StateMachineState.Standby:
        currentStateMachineData.stateMachineState = StateMachineState.FixedCrossFading;
        this._clearCrossData(currentStateMachineData);
        this._prepareStandbyCrossFading(currentStateMachineData);
        break;
      case StateMachineState.Playing:
        currentStateMachineData.stateMachineState = StateMachineState.CrossFading;
        this._clearCrossData(currentStateMachineData);
        this._prepareCrossFading(currentStateMachineData);
        break;
      case StateMachineState.CrossFading:
        currentStateMachineData.stateMachineState = StateMachineState.FixedCrossFading;
        this._prepareFixedPoseCrossFading(currentStateMachineData);
        break;
      case StateMachineState.FixedCrossFading:
        this._prepareFixedPoseCrossFading(currentStateMachineData);
        break;
    }

    currentStateMachineData.crossFadeTransition = transition;
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

      if (time <= lastClipTime) {
        const { handlers } = eventHandler;
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

  private _checkAutoPlay(): void {
    const { layers } = this._animatorController;
    for (let i = 0, n = layers.length; i < n; ++i) {
      const stateMachine = layers[i].stateMachine;
      if (stateMachine?.defaultState) {
        this.play(stateMachine.defaultState.name, i);
      }
    }
  }

  private _playState(
    state: AnimatorState,
    animatorLayerData: AnimatorLayerData,
    normalizedTimeOffset: number = 0
  ): void {
    if (!state.clip) {
      console.warn(`The state named ${state.name} has no AnimationClip data.`);
      return;
    }
    const { currentStateMachineData } = animatorLayerData;
    const animatorStateData = this._getAnimatorStateData(state.name, state, animatorLayerData);
    this._preparePlay(animatorLayerData, state, animatorStateData);

    currentStateMachineData.stateMachineState = StateMachineState.Playing;
    currentStateMachineData.srcPlayData.reset(state, animatorStateData, state.getDuration() * normalizedTimeOffset);
  }

  private _crossFadeState(
    state: AnimatorState,
    layerIndex: number,
    stateMachineData: AnimatorStateMachineData,
    normalizedTransitionDuration: number,
    normalizedTimeOffset: number
  ) {
    if (!state.clip) {
      console.warn(`The state named ${state.name} has no AnimationClip data.`);
      return;
    }
    const { manuallyTransition } = stateMachineData;
    manuallyTransition.duration = normalizedTransitionDuration;
    manuallyTransition.offset = normalizedTimeOffset;
    manuallyTransition.destinationState = state;
    this._crossFadeByTransition(manuallyTransition, layerIndex, 0);
  }

  private _playStateMachine(
    stateMachine: AnimatorStateMachine,
    layerIndex: number = -1,
    normalizedTimeOffset: number = 0
  ): void {
    const animatorLayerData = this._getAnimatorLayerData(layerIndex);
    animatorLayerData.getAnimatorStateMachineData("", this.animatorController.layers[layerIndex].stateMachine);
    const { state, time, stateMachineData } =
      this._seekState("", stateMachine, stateMachine.getDuration() * normalizedTimeOffset, animatorLayerData) || {};

    if (!state) {
      console.warn(`The state machine named ${stateMachine.name} has no default state.`);
      return;
    }

    animatorLayerData.currentStateMachineData = stateMachineData;
    this._playState(state, animatorLayerData, time / state.getDuration());
  }

  private _crossFadeStateMachine(
    stateMachine: AnimatorStateMachine,
    layerIndex: number,
    normalizedTransitionDuration: number,
    normalizedTimeOffset: number
  ) {
    const animatorLayerData = this._getAnimatorLayerData(layerIndex);
    animatorLayerData.getAnimatorStateMachineData("", this.animatorController.layers[layerIndex].stateMachine);
    const { state, time, stateMachineData } =
      this._seekState("", stateMachine, stateMachine.getDuration() * normalizedTimeOffset, animatorLayerData) || {};

    if (!state) {
      console.warn(`The state machine named ${stateMachine.name} has no default state.`);
      return;
    }

    animatorLayerData.currentStateMachineData = stateMachineData;
    this._crossFadeState(
      state,
      layerIndex,
      stateMachineData,
      normalizedTransitionDuration,
      normalizedTimeOffset + time / state.getDuration()
    );
  }

  private _seekState(
    parentPath: string,
    stateMachine: AnimatorStateMachine,
    time: number,
    animatorLayerData: AnimatorLayerData
  ): StateSeekedInfo {
    let start: AnimatorState | AnimatorStateMachine = stateMachine.defaultState;

    if (!start) {
      return null;
    }

    let stateMachinePath = parentPath + "/" + stateMachine.name;
    const stateMachineData = animatorLayerData.getAnimatorStateMachineData(stateMachinePath, stateMachine);
    let lastTransition: AnimatorStateTransition;
    while (true) {
      const transition = start.transitions[0];
      const { exitTime, duration: transitionDuration, destinationState, destinationStateMachine } = transition || {};
      const srcDur = start.getDuration();
      const lastTransitionDuration = srcDur * (lastTransition?.duration ?? 0);
      const lastTransitionOffset = srcDur * (lastTransition?.offset ?? 0);

      let shouldSeek = false;
      let shouldReturn = false;
      if (destinationState && destinationState !== stateMachine.exitState) {
        const destDur = destinationState.getDuration();
        const boundaryTime = srcDur * exitTime + destDur * transitionDuration;
        if (time < boundaryTime) {
          if (start instanceof AnimatorState) {
            shouldReturn = true;
          } else {
            shouldSeek = true;
          }
        } else {
          time -= boundaryTime;
          start = destinationState;
        }
      } else if (destinationStateMachine) {
        const destDur = destinationStateMachine?.defaultState?.getDuration() || 0;
        const boundaryTime = srcDur * exitTime + destDur * transitionDuration;
        if (time < boundaryTime) {
          if (start instanceof AnimatorState) {
            shouldReturn = true;
          } else {
            shouldSeek = true;
          }
        } else {
          time -= boundaryTime;
          start = destinationStateMachine;
        }
      }
      if (shouldSeek) {
        const info = this._seekState(stateMachinePath, start as AnimatorStateMachine, time, animatorLayerData);
        return info
          ? info
          : {
              state: start as AnimatorState,
              time: time + lastTransitionOffset + lastTransitionDuration,
              stateMachineData
            };
      } else if (shouldReturn) {
        return {
          state: start as AnimatorState,
          time: time + lastTransitionOffset + lastTransitionDuration,
          stateMachineData
        };
      }
      lastTransition = transition;
    }
  }
}
