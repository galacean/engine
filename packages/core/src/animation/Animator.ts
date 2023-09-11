import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { ClassPool } from "../RenderPipeline/ClassPool";
import { Renderer } from "../Renderer";
import { Script } from "../Script";
import { Logger } from "../base";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { AnimatorController } from "./AnimatorController";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { KeyframeValueType } from "./Keyframe";
import { AnimatorCullingMode } from "./enums/AnimatorCullingMode";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { AnimatorStatePlayState } from "./enums/AnimatorStatePlayState";
import { LayerState } from "./enums/LayerState";
import { AnimationCurveLayerOwner } from "./internal/AnimationCurveLayerOwner";
import { AnimationEventHandler } from "./internal/AnimationEventHandler";
import { AnimatorLayerData } from "./internal/AnimatorLayerData";
import { AnimatorStateData } from "./internal/AnimatorStateData";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";
import { AnimationCurveOwner } from "./internal/animationCurveOwner/AnimationCurveOwner";
/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  /** Culling mode of this Animator. */
  cullingMode: AnimatorCullingMode = AnimatorCullingMode.None;
  /** The playback speed of the Animator, 1.0 is normal playback speed. */
  @assignmentClone
  speed: number = 1.0;

  /** @internal */
  _playFrameCount: number;
  /** @internal */
  _onUpdateIndex: number = -1;

  protected _animatorController: AnimatorController;

  @ignoreClone
  protected _controllerUpdateFlag: BoolUpdateFlag;
  @ignoreClone
  protected _updateMark: number = 0;

  @ignoreClone
  private _animatorLayersData: AnimatorLayerData[] = [];
  @ignoreClone
  private _curveOwnerPool: Record<number, Record<string, AnimationCurveOwner<KeyframeValueType>>> = Object.create(null);
  @ignoreClone
  private _animationEventHandlerPool: ClassPool<AnimationEventHandler> = new ClassPool(AnimationEventHandler);

  @ignoreClone
  private _tempAnimatorStateInfo: IAnimatorStateInfo = { layerIndex: -1, state: null };

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
    if (this._controllerUpdateFlag?.flag) {
      this._reset();
    }

    this._playFrameCount = this.engine.time.frameCount;

    const stateInfo = this._getAnimatorStateInfo(stateName, layerIndex);
    const { state, layerIndex: playLayerIndex } = stateInfo;

    if (!state) {
      return;
    }
    if (!state.clip) {
      Logger.warn(`The state named ${stateName} has no AnimationClip data.`);
      return;
    }

    const animatorLayerData = this._getAnimatorLayerData(playLayerIndex);
    const animatorStateData = this._getAnimatorStateData(stateName, state, animatorLayerData, playLayerIndex);

    this._preparePlay(animatorLayerData, state);

    animatorLayerData.layerState = LayerState.Playing;
    animatorLayerData.srcPlayData.reset(state, animatorStateData, state._getDuration() * normalizedTimeOffset);

    this.update(0);
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
      this._reset();
    }

    this._playFrameCount = this.engine.time.frameCount;

    const { state, layerIndex: playLayerIndex } = this._getAnimatorStateInfo(stateName, layerIndex);
    const { manuallyTransition } = this._getAnimatorLayerData(playLayerIndex);
    manuallyTransition.duration = normalizedTransitionDuration;
    manuallyTransition.offset = normalizedTimeOffset;
    manuallyTransition.destinationState = state;
    if (this._crossFadeByTransition(manuallyTransition, playLayerIndex)) {
      this.update(0);
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

    this._updateMark++;

    for (let i = 0, n = animatorController.layers.length; i < n; i++) {
      const animatorLayerData = this._getAnimatorLayerData(i);
      if (animatorLayerData.layerState === LayerState.Standby) {
        continue;
      }

      this._updateLayer(i, i === 0, deltaTime, animationUpdate);
    }
  }

  /**
   * Get the playing state from the target layerIndex.
   * @param layerIndex - The layer index
   */
  getCurrentAnimatorState(layerIndex: number): AnimatorState {
    return this._animatorLayersData[layerIndex]?.srcPlayData?.state;
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
   * @internal
   */
  override _onEnable(): void {
    this.engine._componentsManager.addOnUpdateAnimations(this);
    this.animatorController && this._checkAutoPlay();
    this._entity.getComponentsIncludeChildren(Renderer, this._controlledRenderers);
  }

  /**
   * @internal
   */
  override _onDisable(): void {
    this.engine._componentsManager.removeOnUpdateAnimations(this);
  }

  /**
   * @internal
   */
  _reset(): void {
    const { _curveOwnerPool: animationCurveOwners } = this;
    for (let instanceId in animationCurveOwners) {
      const propertyOwners = animationCurveOwners[instanceId];
      for (let property in propertyOwners) {
        const owner = propertyOwners[property];
        owner.revertDefaultValue();
      }
    }

    this._animatorLayersData.length = 0;
    this._curveOwnerPool = {};
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

  private _getAnimatorStateData(
    stateName: string,
    animatorState: AnimatorState,
    animatorLayerData: AnimatorLayerData,
    layerIndex: number
  ): AnimatorStateData {
    const { animatorStateDataMap } = animatorLayerData;
    let animatorStateData = animatorStateDataMap[stateName];
    if (!animatorStateData) {
      animatorStateData = new AnimatorStateData();
      animatorStateDataMap[stateName] = animatorStateData;
      this._saveAnimatorStateData(animatorState, animatorStateData, animatorLayerData, layerIndex);
      this._saveAnimatorEventHandlers(animatorState, animatorStateData);
    }
    return animatorStateData;
  }

  private _saveAnimatorStateData(
    animatorState: AnimatorState,
    animatorStateData: AnimatorStateData,
    animatorLayerData: AnimatorLayerData,
    layerIndex: number
  ): void {
    const { entity, _curveOwnerPool: curveOwnerPool } = this;
    const { curveLayerOwner } = animatorStateData;
    const { _curveBindings: curves } = animatorState.clip;

    const { curveOwnerPool: layerCurveOwnerPool } = animatorLayerData;

    for (let i = curves.length - 1; i >= 0; i--) {
      const curve = curves[i];
      const targetEntity = curve.relativePath === "" ? entity : entity.findByPath(curve.relativePath);
      if (targetEntity) {
        const { property } = curve;
        const { instanceId } = targetEntity;

        // Get owner
        const propertyOwners = (curveOwnerPool[instanceId] ||= Object.create(null));
        const owner = (propertyOwners[property] ||= curve._createCurveOwner(targetEntity));

        // Get layer owner
        const layerPropertyOwners = (layerCurveOwnerPool[instanceId] ||= Object.create(null));
        const layerOwner = (layerPropertyOwners[property] ||= curve._createCurveLayerOwner(owner));

        curveLayerOwner[i] = layerOwner;
      } else {
        curveLayerOwner[i] = null;
        Logger.warn(`The entity don\'t have the child entity which path is ${curve.relativePath}.`);
      }
    }
  }

  private _saveAnimatorEventHandlers(state: AnimatorState, animatorStateData: AnimatorStateData): void {
    const eventHandlerPool = this._animationEventHandlerPool;
    const scripts = [];
    this._entity.getComponents(Script, scripts);
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
        const handler = <Function>scripts[j][funcName];
        handler && handlers.push(handler);
      }
      eventHandlers.push(eventHandler);
    }
  }

  private _clearCrossData(animatorLayerData: AnimatorLayerData): void {
    animatorLayerData.crossCurveMark++;
    animatorLayerData.crossLayerOwnerCollection.length = 0;
  }

  private _addCrossOwner(
    animatorLayerData: AnimatorLayerData,
    layerOwner: AnimationCurveLayerOwner,
    curCurveIndex: number,
    nextCurveIndex: number
  ): void {
    layerOwner.crossSrcCurveIndex = curCurveIndex;
    layerOwner.crossDestCurveIndex = nextCurveIndex;
    animatorLayerData.crossLayerOwnerCollection.push(layerOwner);
  }

  private _prepareCrossFading(animatorLayerData: AnimatorLayerData): void {
    // Add src cross curve data.
    this._prepareSrcCrossData(animatorLayerData, false);
    // Add dest cross curve data.
    this._prepareDestCrossData(animatorLayerData, false);
  }

  private _prepareStandbyCrossFading(animatorLayerData: AnimatorLayerData): void {
    // Standby have two sub state, one is never play, one is finished, never play srcPlayData.state is null.
    animatorLayerData.srcPlayData.state && this._prepareSrcCrossData(animatorLayerData, true);
    // Add dest cross curve data.
    this._prepareDestCrossData(animatorLayerData, true);
  }

  private _prepareFixedPoseCrossFading(animatorLayerData: AnimatorLayerData): void {
    const { crossLayerOwnerCollection } = animatorLayerData;

    // Save current cross curve data owner fixed pose.
    for (let i = crossLayerOwnerCollection.length - 1; i >= 0; i--) {
      const layerOwner = crossLayerOwnerCollection[i];
      if (!layerOwner) continue;
      layerOwner.curveOwner.saveFixedPoseValue();
      // Reset destCurveIndex When fixed pose crossFading again.
      layerOwner.crossDestCurveIndex = -1;
    }
    // prepare dest AnimatorState cross data.
    this._prepareDestCrossData(animatorLayerData, true);
  }

  private _prepareSrcCrossData(animatorLayerData: AnimatorLayerData, saveFixed: boolean): void {
    const { curveLayerOwner } = animatorLayerData.srcPlayData.stateData;
    for (let i = curveLayerOwner.length - 1; i >= 0; i--) {
      const layerOwner = curveLayerOwner[i];
      if (!layerOwner) continue;
      layerOwner.crossCurveMark = animatorLayerData.crossCurveMark;
      saveFixed && layerOwner.curveOwner.saveFixedPoseValue();
      this._addCrossOwner(animatorLayerData, layerOwner, i, -1);
    }
  }

  private _prepareDestCrossData(animatorLayerData: AnimatorLayerData, saveFixed: boolean): void {
    const { curveLayerOwner } = animatorLayerData.destPlayData.stateData;
    for (let i = curveLayerOwner.length - 1; i >= 0; i--) {
      const layerOwner = curveLayerOwner[i];
      if (!layerOwner) continue;
      if (layerOwner.crossCurveMark === animatorLayerData.crossCurveMark) {
        layerOwner.crossDestCurveIndex = i;
      } else {
        const owner = layerOwner.curveOwner;
        saveFixed && owner.saveFixedPoseValue();
        layerOwner.crossCurveMark = animatorLayerData.crossCurveMark;
        this._addCrossOwner(animatorLayerData, layerOwner, -1, i);
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
    const { srcPlayData, destPlayData } = layerData;
    const additive = blendingMode === AnimatorLayerBlendingMode.Additive;
    firstLayer && (weight = 1.0);

    switch (layerData.layerState) {
      case LayerState.Playing:
        this._updatePlayingState(srcPlayData, layerData, layerIndex, weight, deltaTime, additive, aniUpdate);
        break;
      case LayerState.FixedCrossFading:
        this._updateCrossFadeFromPose(destPlayData, layerData, layerIndex, weight, deltaTime, additive, aniUpdate);
        break;
      case LayerState.CrossFading:
        this._updateCrossFade(srcPlayData, destPlayData, layerData, layerIndex, weight, deltaTime, additive, aniUpdate);
        break;
      case LayerState.Finished:
        this._updateFinishedState(srcPlayData, weight, additive, aniUpdate);
        break;
    }
  }

  private _updatePlayingState(
    playData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    layerIndex: number,
    weight: number,
    delta: number,
    additive: boolean,
    aniUpdate: boolean
  ): void {
    const { curveLayerOwner, eventHandlers } = playData.stateData;
    const { state, playState: lastPlayState, clipTime: lastClipTime } = playData;
    const { transitions } = state;
    const { _curveBindings: curveBindings } = state.clip;

    const speed = state.speed * this.speed;
    playData.frameTime += speed * delta;

    playData.update(speed < 0);

    const { clipTime, playState } = playData;
    const finished = playState === AnimatorStatePlayState.Finished;

    if (aniUpdate || finished) {
      for (let i = curveBindings.length - 1; i >= 0; i--) {
        const layerOwner = curveLayerOwner[i];
        const owner = layerOwner?.curveOwner;

        if (!owner) continue;

        const curve = curveBindings[i].curve;
        if (curve.keys.length) {
          this._checkRevertOwner(owner, additive);

          const value = owner.evaluateValue(curve, clipTime, additive);
          aniUpdate && owner.applyValue(value, weight, additive);
          finished && layerOwner.saveFinalValue();
        }
      }
    }

    if (playState === AnimatorStatePlayState.Finished) {
      layerData.layerState = LayerState.Finished;
    }
    eventHandlers.length && this._fireAnimationEvents(playData, eventHandlers, lastClipTime, clipTime);

    if (lastPlayState === AnimatorStatePlayState.UnStarted) {
      this._callAnimatorScriptOnEnter(state, layerIndex);
    }
    if (playState === AnimatorStatePlayState.Finished) {
      this._callAnimatorScriptOnExit(state, layerIndex);
    } else {
      this._callAnimatorScriptOnUpdate(state, layerIndex);
    }

    if (transitions.length) {
      const { layerState } = layerData;
      if (layerState !== LayerState.CrossFading && layerState !== LayerState.FixedCrossFading) {
        this._checkTransition(playData, transitions, layerIndex, lastClipTime, clipTime);
      }
    }
  }

  private _updateCrossFade(
    srcPlayData: AnimatorStatePlayData,
    destPlayData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    layerIndex: number,
    weight: number,
    delta: number,
    additive: boolean,
    aniUpdate: boolean
  ) {
    const { speed } = this;
    const { crossLayerOwnerCollection } = layerData;
    const { _curveBindings: srcCurves } = srcPlayData.state.clip;
    const { state: srcState, stateData: srcStateData, playState: lastSrcPlayState } = srcPlayData;
    const { eventHandlers: srcEventHandlers } = srcStateData;
    const { state: destState, stateData: destStateData, playState: lastDstPlayState } = destPlayData;
    const { eventHandlers: destEventHandlers } = destStateData;
    const { _curveBindings: destCurves } = destState.clip;
    const { clipTime: lastSrcClipTime } = srcPlayData;
    const { clipTime: lastDestClipTime } = destPlayData;

    const duration = destState._getDuration() * layerData.crossFadeTransition.duration;
    let crossWeight = Math.abs(destPlayData.frameTime) / duration;
    (crossWeight >= 1.0 || duration === 0) && (crossWeight = 1.0);

    const srcSpeed = srcState.speed * speed;
    const destSpeed = destState.speed * speed;

    srcPlayData.frameTime += srcSpeed * delta;
    destPlayData.frameTime += destSpeed * delta;

    srcPlayData.update(srcSpeed < 0);
    destPlayData.update(destSpeed < 0);

    const { clipTime: srcClipTime, playState: srcPlayState } = srcPlayData;
    const { clipTime: destClipTime, playState: destPlayState } = destPlayData;
    const finished = destPlayData.playState === AnimatorStatePlayState.Finished;

    if (aniUpdate || finished) {
      for (let i = crossLayerOwnerCollection.length - 1; i >= 0; i--) {
        const layerOwner = crossLayerOwnerCollection[i];
        const owner = layerOwner?.curveOwner;

        if (!owner) continue;

        const srcCurveIndex = layerOwner.crossSrcCurveIndex;
        const destCurveIndex = layerOwner.crossDestCurveIndex;

        this._checkRevertOwner(owner, additive);

        const value = owner.evaluateCrossFadeValue(
          srcCurveIndex >= 0 ? srcCurves[srcCurveIndex].curve : null,
          destCurveIndex >= 0 ? destCurves[destCurveIndex].curve : null,
          srcClipTime,
          destClipTime,
          crossWeight,
          additive
        );
        aniUpdate && owner.applyValue(value, weight, additive);
        finished && layerOwner.saveFinalValue();
      }
    }

    this._updateCrossFadeData(layerData, crossWeight);

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
  }

  private _updateCrossFadeFromPose(
    destPlayData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    layerIndex: number,
    weight: number,
    delta: number,
    additive: boolean,
    aniUpdate: boolean
  ) {
    const { crossLayerOwnerCollection } = layerData;
    const { state, stateData, playState: lastPlayState } = destPlayData;
    const { eventHandlers } = stateData;
    const { _curveBindings: curveBindings } = state.clip;
    const { clipTime: lastDestClipTime } = destPlayData;

    const duration = state._getDuration() * layerData.crossFadeTransition.duration;
    let crossWeight = Math.abs(destPlayData.frameTime) / duration;
    (crossWeight >= 1.0 || duration === 0) && (crossWeight = 1.0);

    const speed = state.speed * this.speed;

    destPlayData.frameTime += speed * delta;
    destPlayData.update(speed < 0);

    const { clipTime: destClipTime, playState } = destPlayData;
    const finished = playState === AnimatorStatePlayState.Finished;

    // When the animator is culled (aniUpdate=false), if the play state has finished, the final value needs to be calculated and saved to be applied directly.
    if (aniUpdate || finished) {
      for (let i = crossLayerOwnerCollection.length - 1; i >= 0; i--) {
        const layerOwner = crossLayerOwnerCollection[i];
        const owner = layerOwner?.curveOwner;

        if (!owner) continue;

        const curveIndex = layerOwner.crossDestCurveIndex;

        this._checkRevertOwner(owner, additive);

        const value = layerOwner.curveOwner.crossFadeFromPoseAndApplyValue(
          curveIndex >= 0 ? curveBindings[curveIndex].curve : null,
          destClipTime,
          crossWeight,
          additive
        );
        aniUpdate && owner.applyValue(value, weight, additive);
        finished && layerOwner.saveFinalValue();
      }
    }

    this._updateCrossFadeData(layerData, crossWeight);

    //@todo: srcState is missing the judgment of the most recent period."
    eventHandlers.length && this._fireAnimationEvents(destPlayData, eventHandlers, lastDestClipTime, destClipTime);

    if (lastPlayState === AnimatorStatePlayState.UnStarted) {
      this._callAnimatorScriptOnEnter(state, layerIndex);
    }
    if (playState === AnimatorStatePlayState.Finished) {
      this._callAnimatorScriptOnExit(state, layerIndex);
    } else {
      this._callAnimatorScriptOnUpdate(state, layerIndex);
    }
  }

  private _updateFinishedState(
    playData: AnimatorStatePlayData,
    weight: number,
    additive: boolean,
    aniUpdate: boolean
  ): void {
    if (!aniUpdate) {
      return;
    }

    const { curveLayerOwner } = playData.stateData;
    const { _curveBindings: curveBindings } = playData.state.clip;

    for (let i = curveBindings.length - 1; i >= 0; i--) {
      const layerOwner = curveLayerOwner[i];
      const owner = layerOwner?.curveOwner;

      if (!owner) continue;

      this._checkRevertOwner(owner, additive);

      owner.applyValue(layerOwner.finalValue, weight, additive);
    }
  }

  private _updateCrossFadeData(layerData: AnimatorLayerData, crossWeight: number): void {
    const { destPlayData } = layerData;
    if (crossWeight === 1.0) {
      if (destPlayData.playState === AnimatorStatePlayState.Finished) {
        layerData.layerState = LayerState.Finished;
      } else {
        layerData.layerState = LayerState.Playing;
      }
      layerData.switchPlayData();
      layerData.crossFadeTransition = null;
    }
  }

  private _preparePlay(layerData: AnimatorLayerData, playState: AnimatorState): void {
    if (layerData.layerState === LayerState.Playing) {
      const srcPlayData = layerData.srcPlayData;
      if (srcPlayData.state !== playState) {
        const { curveLayerOwner } = srcPlayData.stateData;
        for (let i = curveLayerOwner.length - 1; i >= 0; i--) {
          curveLayerOwner[i]?.curveOwner.revertDefaultValue();
        }
      }
    } else {
      // layerState is CrossFading, FixedCrossFading, Standby, Finished
      const { crossLayerOwnerCollection } = layerData;
      for (let i = crossLayerOwnerCollection.length - 1; i >= 0; i--) {
        crossLayerOwnerCollection[i].curveOwner.revertDefaultValue();
      }
    }
  }

  private _checkTransition(
    playState: AnimatorStatePlayData,
    transitions: Readonly<AnimatorStateTransition[]>,
    layerIndex: number,
    lastClipTime: number,
    clipTime: number
  ) {
    const { state } = playState;
    const clipDuration = state.clip.length;

    if (this.speed * state.speed >= 0) {
      console.log(999, clipTime, lastClipTime);
      if (clipTime < lastClipTime) {
        this._checkSubTransition(playState, transitions, layerIndex, lastClipTime, state.clipEndTime * clipDuration);
        playState.currentTransitionIndex = 0;
        this._checkSubTransition(playState, transitions, layerIndex, state.clipStartTime * clipDuration, clipTime);
      } else {
        this._checkSubTransition(playState, transitions, layerIndex, lastClipTime, clipTime);
      }
    } else {
      if (clipTime > lastClipTime) {
        this._checkBackwardsSubTransition(
          playState,
          transitions,
          layerIndex,
          lastClipTime,
          state.clipStartTime * clipDuration
        );
        playState.currentTransitionIndex = transitions.length - 1;
        this._checkBackwardsSubTransition(
          playState,
          transitions,
          layerIndex,
          clipTime,
          state.clipEndTime * clipDuration
        );
      } else {
        this._checkBackwardsSubTransition(playState, transitions, layerIndex, lastClipTime, clipTime);
      }
    }
  }

  private _checkSubTransition(
    playState: AnimatorStatePlayData,
    transitions: Readonly<AnimatorStateTransition[]>,
    layerIndex: number,
    lastClipTime: number,
    curClipTime: number
  ) {
    let transitionIndex = playState.currentTransitionIndex;
    const duration = playState.state._getDuration();
    for (let n = transitions.length; transitionIndex < n; transitionIndex++) {
      const transition = transitions[transitionIndex];
      const exitTime = transition.exitTime * duration;
      if (exitTime > curClipTime) {
        break;
      }

      if (exitTime >= lastClipTime) {
        this._crossFadeByTransition(transition, layerIndex);
        playState.currentTransitionIndex = Math.min(transitionIndex + 1, n - 1);
      }
    }
  }

  private _checkBackwardsSubTransition(
    playState: AnimatorStatePlayData,
    transitions: Readonly<AnimatorStateTransition[]>,
    layerIndex: number,
    lastClipTime: number,
    curClipTime: number
  ) {
    let transitionIndex = playState.currentTransitionIndex;
    const duration = playState.state._getDuration();
    for (; transitionIndex >= 0; transitionIndex--) {
      const transition = transitions[transitionIndex];
      const exitTime = transition.exitTime * duration;
      if (exitTime < curClipTime) {
        break;
      }

      if (exitTime <= lastClipTime) {
        this._crossFadeByTransition(transition, layerIndex);
        playState.currentTransitionIndex = Math.max(transitionIndex - 1, 0);
      }
    }
  }

  private _crossFadeByTransition(transition: AnimatorStateTransition, layerIndex: number): boolean {
    const crossState = transition.destinationState;
    if (!crossState) {
      return false;
    }
    if (!crossState.clip) {
      Logger.warn(`The state named ${name} has no AnimationClip data.`);
      return false;
    }

    const animatorLayerData = this._getAnimatorLayerData(layerIndex);
    const layerState = animatorLayerData.layerState;
    const { destPlayData } = animatorLayerData;

    const animatorStateData = this._getAnimatorStateData(crossState.name, crossState, animatorLayerData, layerIndex);
    const duration = crossState._getDuration();
    const offset = duration * transition.offset;
    destPlayData.reset(crossState, animatorStateData, offset);

    switch (layerState) {
      case LayerState.Standby:
      case LayerState.Finished:
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

    return true;
  }

  private _fireAnimationEvents(
    playState: AnimatorStatePlayData,
    eventHandlers: AnimationEventHandler[],
    lastClipTime: number,
    clipTime: number
  ): void {
    const { state } = playState;
    const clipDuration = state.clip.length;

    if (this.speed * state.speed >= 0) {
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

  private _checkRevertOwner(owner: AnimationCurveOwner<KeyframeValueType>, additive: boolean): void {
    if (additive && owner.updateMark !== this._updateMark) {
      owner.revertDefaultValue();
    }
    owner.updateMark = this._updateMark;
  }
}

interface IAnimatorStateInfo {
  layerIndex: number;
  state: AnimatorState;
}
