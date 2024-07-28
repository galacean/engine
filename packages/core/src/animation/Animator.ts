import { BoolUpdateFlag } from "../BoolUpdateFlag";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { Renderer } from "../Renderer";
import { Script } from "../Script";
import { Logger } from "../base/Logger";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { ClearableObjectPool } from "../utils/ClearableObjectPool";
import { AnimatorController } from "./AnimatorController";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { AnimatorControllerParameter, AnimatorControllerParameterValue } from "./AnimatorControllerParameter";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorStateTransition";
import { KeyframeValueType } from "./Keyframe";
import { AnimatorConditionMode } from "./enums/AnimatorConditionMode";
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
import { MathUtil } from "@galacean/engine-math";

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
  _playFrameCount: number = -1;
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
  private _animationEventHandlerPool = new ClearableObjectPool(AnimationEventHandler);
  @ignoreClone
  private _parametersValueMap = <Record<string, AnimatorControllerParameterValue>>Object.create(null);

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
   * The layers in the animator's controller.
   */
  get layers(): Readonly<AnimatorControllerLayer[]> {
    return this._animatorController?._layers;
  }

  /**
   * The parameters in the animator's controller.
   */
  get parameters(): Readonly<AnimatorControllerParameter[]> {
    return this._animatorController?._parameters;
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

    const stateInfo = this._getAnimatorStateInfo(stateName, layerIndex);
    const { state } = stateInfo;

    if (!state) {
      return;
    }

    if (this._preparePlay(state, stateInfo.layerIndex, normalizedTimeOffset)) {
      this._playFrameCount = this.engine.time.frameCount;
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
    if (this._controllerUpdateFlag?.flag) {
      this._reset();
    }

    const { state, layerIndex: playLayerIndex } = this._getAnimatorStateInfo(stateName, layerIndex);
    const { manuallyTransition } = this._getAnimatorLayerData(playLayerIndex);
    manuallyTransition.duration = normalizedTransitionDuration;
    manuallyTransition.offset = normalizedTimeOffset;
    manuallyTransition.destinationState = state;

    if (this._prepareCrossFadeByTransition(manuallyTransition, playLayerIndex)) {
      this._playFrameCount = this.engine.time.frameCount;
    }
  }

  /**
   * Evaluates the animator component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update
   */
  update(deltaTime: number): void {
    // Play or crossFade in script, animation playing from the first frame, deltaTime should be 0
    if (this._playFrameCount === this.engine.time.frameCount) {
      deltaTime = 0;
    }

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

    const animatorController = this._animatorController;
    if (!animatorController) {
      return;
    }

    if (this._controllerUpdateFlag?.flag) {
      this._reset();
    }

    this._updateMark++;

    const { layers } = animatorController;
    for (let i = 0, n = layers.length; i < n; i++) {
      const layerData = this._getAnimatorLayerData(i);
      this._updateState(i, layerData, layers[i], deltaTime, animationUpdate);
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
   * Get the layer by name.
   * @param name - The layer's name.
   */
  findLayerByName(name: string): AnimatorControllerLayer {
    return this._animatorController?._layersMap[name];
  }

  /**
   * Get the parameter by name from animatorController.
   * @param name - The name of the parameter
   */
  getParameter(name: string): AnimatorControllerParameter {
    return this._animatorController?._parametersMap[name] ?? null;
  }

  /**
   * Get the value of the given parameter.
   * @param name - The name of the parameter
   * @param value - The value of the parameter
   */
  getParameterValue(name: string): AnimatorControllerParameterValue {
    const parameter = this._animatorController?._parametersMap[name];
    if (parameter) {
      return this._parametersValueMap[name] ?? parameter.defaultValue;
    }
    return undefined;
  }

  /**
   * Set the value of the given parameter.
   * @param name - The name of the parameter
   * @param value - The value of the parameter
   */
  setParameterValue(name: string, value: AnimatorControllerParameterValue) {
    const parameter = this._animatorController?._parametersMap[name];
    if (parameter && parameter.defaultValue !== value) {
      this._parametersValueMap[name] = value;
    }
  }

  /**
   * @internal
   */
  override _onEnable(): void {
    this._reset();
    this._entity.getComponentsIncludeChildren(Renderer, this._controlledRenderers);
  }

  /**
   * @internal
   */
  override _onEnableInScene(): void {
    this.scene._componentsManager.addOnUpdateAnimations(this);
  }
  /**
   * @internal
   */
  override _onDisableInScene(): void {
    this.scene._componentsManager.removeOnUpdateAnimations(this);
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
    this._curveOwnerPool = Object.create(null);
    this._parametersValueMap = Object.create(null);
    this._animationEventHandlerPool.clear();

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
    let { mask } = this._animatorController.layers[layerIndex];
    const { curveLayerOwner } = animatorStateData;
    const { _curveBindings: curves } = animatorState.clip;

    const { curveOwnerPool: layerCurveOwnerPool } = animatorLayerData;

    for (let i = curves.length - 1; i >= 0; i--) {
      const curve = curves[i];
      const { relativePath } = curve;
      const targetEntity = curve.relativePath === "" ? entity : entity.findByPath(curve.relativePath);
      if (targetEntity) {
        const component =
          curve.typeIndex > 0
            ? targetEntity.getComponents(curve.type, AnimationCurveOwner._components)[curve.typeIndex]
            : targetEntity.getComponent(curve.type);

        if (!component) {
          continue;
        }

        const { property } = curve;
        const { instanceId } = component;
        // Get owner
        const propertyOwners = (curveOwnerPool[instanceId] ||= <Record<string, AnimationCurveOwner<KeyframeValueType>>>(
          Object.create(null)
        ));
        const owner = (propertyOwners[property] ||= curve._createCurveOwner(targetEntity, component));

        // Get layer owner
        const layerPropertyOwners = (layerCurveOwnerPool[instanceId] ||= <Record<string, AnimationCurveLayerOwner>>(
          Object.create(null)
        ));
        const layerOwner = (layerPropertyOwners[property] ||= curve._createCurveLayerOwner(owner));

        if (mask && mask.pathMasks.length) {
          layerOwner.isActive = mask.getPathMask(relativePath)?.active ?? true;
        }

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
    const { eventHandlers } = animatorStateData;

    const clipChangedListener = () => {
      this._entity.getComponents(Script, scripts);
      const scriptCount = scripts.length;
      const { events } = state.clip;
      eventHandlers.length = 0;
      for (let i = 0, n = events.length; i < n; i++) {
        const event = events[i];
        const eventHandler = eventHandlerPool.get();
        const funcName = event.functionName;
        const { handlers } = eventHandler;

        eventHandler.event = event;
        handlers.length = 0;
        for (let j = scriptCount - 1; j >= 0; j--) {
          const script = scripts[j];
          const handler = <Function>script[funcName].bind(script);
          handler && handlers.push(handler);
        }
        eventHandlers.push(eventHandler);
      }
    };
    clipChangedListener();
    state._updateFlagManager.addListener(clipChangedListener);
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
    // Add src cross curve data
    this._prepareSrcCrossData(animatorLayerData, false);
    // Add dest cross curve data
    this._prepareDestCrossData(animatorLayerData, false);
  }

  private _prepareStandbyCrossFading(animatorLayerData: AnimatorLayerData): void {
    // Standby have two sub state, one is never play, one is finished, never play srcPlayData.state is null
    animatorLayerData.srcPlayData.state && this._prepareSrcCrossData(animatorLayerData, true);
    // Add dest cross curve data
    this._prepareDestCrossData(animatorLayerData, true);
  }

  private _prepareFixedPoseCrossFading(animatorLayerData: AnimatorLayerData): void {
    const { crossLayerOwnerCollection } = animatorLayerData;

    // Save current cross curve data owner fixed pose
    for (let i = crossLayerOwnerCollection.length - 1; i >= 0; i--) {
      const layerOwner = crossLayerOwnerCollection[i];
      if (!layerOwner) continue;
      layerOwner.curveOwner.saveFixedPoseValue();
      // Reset destCurveIndex When fixed pose crossFading again
      layerOwner.crossDestCurveIndex = -1;
    }
    // Prepare dest AnimatorState cross data
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

  private _updateState(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    deltaTime: number,
    aniUpdate: boolean
  ): void {
    let { weight } = layer;
    const additive = layer.blendingMode === AnimatorLayerBlendingMode.Additive;

    layerIndex === 0 && (weight = 1.0);

    switch (layerData.layerState) {
      case LayerState.Standby:
        this._checkAnyAndEntryState(layerIndex, layerData, layer, deltaTime, aniUpdate);
        break;
      case LayerState.Playing:
        this._updatePlayingState(layerIndex, layerData, layer, weight, additive, deltaTime, aniUpdate);
        break;
      case LayerState.Finished:
        this._updateFinishedState(layerIndex, layerData, layer, weight, additive, deltaTime, aniUpdate);
        break;
      case LayerState.CrossFading:
        this._updateCrossFadeState(layerIndex, layerData, layer, weight, additive, deltaTime, aniUpdate);
        break;
      case LayerState.FixedCrossFading:
        this._updateCrossFadeFromPoseState(layerIndex, layerData, layer, weight, additive, deltaTime, aniUpdate);
        break;
    }
  }

  private _updatePlayingState(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    weight: number,
    additive: boolean,
    deltaTime: number,
    aniUpdate: boolean
  ): void {
    const { srcPlayData } = layerData;
    const { state } = srcPlayData;

    const actualSpeed = state.speed * this.speed;
    const actualDeltaTime = actualSpeed * deltaTime;

    srcPlayData.updateOrientation(actualDeltaTime);

    const { clipTime: lastClipTime, playState: lastPlayState } = srcPlayData;

    // Precalculate to get the transition
    srcPlayData.update(actualDeltaTime);

    const { clipTime, isForwards } = srcPlayData;
    const transition =
      this._applyTransitionsByCondition(
        layerIndex,
        layerData,
        layer,
        state,
        layer.stateMachine.anyStateTransitions,
        aniUpdate
      ) ||
      this._applyStateTransitions(
        layerIndex,
        layerData,
        layer,
        isForwards,
        srcPlayData,
        state.transitions,
        lastClipTime,
        clipTime,
        actualDeltaTime,
        aniUpdate
      );

    let costTime: number;
    if (transition) {
      const clipDuration = state.clip.length;
      const clipEndTime = state.clipEndTime * clipDuration;
      const exitTime = transition.exitTime * state._getDuration();

      if (isForwards) {
        if (exitTime < lastClipTime) {
          costTime = exitTime + clipEndTime - lastClipTime;
        } else {
          costTime = exitTime - lastClipTime;
        }
      } else {
        const startTime = state.clipStartTime * clipDuration;
        if (lastClipTime < exitTime) {
          costTime = clipEndTime - exitTime + lastClipTime - startTime;
        } else {
          costTime = lastClipTime - exitTime;
        }
        costTime = -costTime;
      }
      // Revert actualDeltaTime and update costTime
      srcPlayData.update(costTime - actualDeltaTime);
    } else {
      costTime = actualDeltaTime;
    }

    const needSwitchLayerState = !!transition;
    const layerFinished = !needSwitchLayerState && srcPlayData.playState === AnimatorStatePlayState.Finished;
    if (layerFinished) {
      layerData.layerState = LayerState.Finished;
    }

    this._evaluatePlayingState(srcPlayData, weight, additive, aniUpdate);
    this._fireAnimationEventsAndCallScripts(layerIndex, srcPlayData, state, lastClipTime, lastPlayState, costTime);

    if (needSwitchLayerState) {
      const remainDeltaTime = deltaTime - costTime / actualSpeed;
      this._updateState(layerIndex, layerData, layer, remainDeltaTime, aniUpdate);
    }
  }

  private _evaluatePlayingState(
    playData: AnimatorStatePlayData,
    weight: number,
    additive: boolean,
    aniUpdate: boolean
  ): void {
    const curveBindings = playData.state.clip._curveBindings;
    const finished = playData.playState === AnimatorStatePlayState.Finished;

    if (aniUpdate || finished) {
      const curveLayerOwner = playData.stateData.curveLayerOwner;
      for (let i = curveBindings.length - 1; i >= 0; i--) {
        const layerOwner = curveLayerOwner[i];
        const owner = layerOwner?.curveOwner;

        if (!owner || !layerOwner.isActive) {
          continue;
        }

        const curve = curveBindings[i].curve;
        if (curve.keys.length) {
          this._checkRevertOwner(owner, additive);

          const value = owner.evaluateValue(curve, playData.clipTime, additive);
          aniUpdate && owner.applyValue(value, weight, additive);
          finished && layerOwner.saveFinalValue();
        }
      }
    }
  }

  private _updateCrossFadeState(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    weight: number,
    additive: boolean,
    deltaTime: number,
    aniUpdate: boolean
  ) {
    const { srcPlayData, destPlayData } = layerData;
    const { speed } = this;
    const { state: srcState } = srcPlayData;
    const { state: destState } = destPlayData;
    const destStateDuration = destState._getDuration();
    const transitionDuration = destStateDuration * layerData.crossFadeTransition.duration;

    const actualSrcSpeed = srcState.speed * speed;
    const actualDestSpeed = destState.speed * speed;
    const actualDestDeltaTime = actualDestSpeed * deltaTime;

    srcPlayData && srcPlayData.updateOrientation(actualSrcSpeed * deltaTime);
    destPlayData && destPlayData.updateOrientation(actualDestDeltaTime);

    const { clipTime: lastSrcClipTime, playState: lastSrcPlayState } = srcPlayData;
    const { clipTime: lastDestClipTime, playState: lastDstPlayState } = destPlayData;

    let destCostTime: number;
    if (destPlayData.isForwards) {
      destCostTime =
        lastDestClipTime + actualDestDeltaTime > transitionDuration
          ? transitionDuration - lastDestClipTime
          : actualDestDeltaTime;
    } else {
      // The time that has been played
      const playedTime = destStateDuration - lastDestClipTime;
      destCostTime =
        // -actualDestDeltaTime: The time that will be played, negative are meant to make ite be a periods
        // > transition: The time that will be played is enough to finish the transition
        playedTime - actualDestDeltaTime > transitionDuration
          ? // Negative number is used to convert a time period into a reverse deltaTime.
            // -(transitionDuration - playedTime)
            playedTime - transitionDuration
          : actualDestDeltaTime;
    }

    const costTime = actualDestSpeed === 0 ? 0 : destCostTime / actualDestSpeed;
    const srcCostTime = costTime * actualSrcSpeed;

    srcPlayData.update(srcCostTime);
    destPlayData.update(destCostTime);

    let crossWeight = Math.abs(destPlayData.frameTime) / transitionDuration;
    (crossWeight >= 1.0 - MathUtil.zeroTolerance || transitionDuration === 0) && (crossWeight = 1.0);

    const crossFadeFinished = crossWeight === 1.0;

    if (crossFadeFinished) {
      this._preparePlayOwner(layerData, destState);
      this._evaluatePlayingState(destPlayData, weight, additive, aniUpdate);
    } else {
      this._evaluateCrossFadeState(layerData, srcPlayData, destPlayData, weight, additive, aniUpdate);
    }

    this._fireAnimationEventsAndCallScripts(
      layerIndex,
      srcPlayData,
      srcState,
      lastSrcClipTime,
      lastSrcPlayState,
      srcCostTime
    );

    this._fireAnimationEventsAndCallScripts(
      layerIndex,
      destPlayData,
      destState,
      lastDestClipTime,
      lastDstPlayState,
      destCostTime
    );

    if (crossFadeFinished) {
      this._updateCrossFadeData(layerData);
      const remainDeltaTime = deltaTime - costTime;
      remainDeltaTime > MathUtil.zeroTolerance &&
        this._updateState(layerIndex, layerData, layer, remainDeltaTime, aniUpdate);
    }
  }

  private _evaluateCrossFadeState(
    layerData: AnimatorLayerData,
    srcPlayData: AnimatorStatePlayData,
    destPlayData: AnimatorStatePlayData,
    weight: number,
    additive: boolean,
    aniUpdate: boolean
  ) {
    const { crossLayerOwnerCollection } = layerData;
    const { _curveBindings: srcCurves } = srcPlayData.state.clip;
    const { state: destState } = destPlayData;
    const { _curveBindings: destCurves } = destState.clip;

    const transitionDuration = destState._getDuration() * layerData.crossFadeTransition.duration;
    let crossWeight = Math.abs(destPlayData.frameTime) / transitionDuration;
    (crossWeight >= 1.0 || transitionDuration === 0) && (crossWeight = 1.0);

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
          srcPlayData.clipTime,
          destPlayData.clipTime,
          crossWeight,
          additive
        );
        aniUpdate && owner.applyValue(value, weight, additive);
        finished && layerOwner.saveFinalValue();
      }
    }
  }

  private _updateCrossFadeFromPoseState(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    weight: number,
    additive: boolean,
    deltaTime: number,
    aniUpdate: boolean
  ) {
    const { destPlayData } = layerData;
    const { state } = destPlayData;

    const stateDuration = state._getDuration();
    const transitionDuration = stateDuration * layerData.crossFadeTransition.duration;

    const actualSpeed = state.speed * this.speed;
    const actualDeltaTime = actualSpeed * deltaTime;

    destPlayData.updateOrientation(actualDeltaTime);

    const { clipTime: lastDestClipTime, playState: lastPlayState } = destPlayData;

    let destCostTime: number;
    if (destPlayData.isForwards) {
      destCostTime =
        lastDestClipTime + actualDeltaTime > transitionDuration
          ? transitionDuration - lastDestClipTime
          : actualDeltaTime;
    } else {
      // The time that has been played
      const playedTime = stateDuration - lastDestClipTime;
      destCostTime =
        // -actualDestDeltaTime: The time that will be played, negative are meant to make ite be a periods
        // > transition: The time that will be played is enough to finish the transition
        playedTime - actualDeltaTime > transitionDuration
          ? // Negative number is used to convert a time period into a reverse deltaTime.
            // -(transitionDuration - playedTime)
            playedTime - transitionDuration
          : actualDeltaTime;
    }

    const costTime = actualSpeed === 0 ? 0 : destCostTime / actualSpeed;

    destPlayData.update(destCostTime);

    let crossWeight = Math.abs(destPlayData.frameTime) / transitionDuration;
    (crossWeight >= 1.0 || transitionDuration === 0) && (crossWeight = 1.0);

    const crossFadeFinished = crossWeight === 1.0;

    if (crossFadeFinished) {
      this._preparePlayOwner(layerData, state);
      this._evaluatePlayingState(destPlayData, weight, additive, aniUpdate);
    } else {
      this._evaluateCrossFadeFromPoseState(layerData, destPlayData, weight, additive, aniUpdate);
    }

    this._fireAnimationEventsAndCallScripts(
      layerIndex,
      destPlayData,
      state,
      lastDestClipTime,
      lastPlayState,
      destCostTime
    );

    if (crossFadeFinished) {
      this._updateCrossFadeData(layerData);
      const remainDeltaTime = deltaTime - costTime;
      remainDeltaTime > MathUtil.zeroTolerance &&
        this._updateState(layerIndex, layerData, layer, remainDeltaTime, aniUpdate);
    }
  }

  private _evaluateCrossFadeFromPoseState(
    layerData: AnimatorLayerData,
    destPlayData: AnimatorStatePlayData,
    weight: number,
    additive: boolean,
    aniUpdate: boolean
  ) {
    const { crossLayerOwnerCollection } = layerData;
    const { state } = destPlayData;
    const { _curveBindings: curveBindings } = state.clip;

    const duration = state._getDuration() * layerData.crossFadeTransition.duration;
    let crossWeight = Math.abs(destPlayData.frameTime) / duration;
    (crossWeight >= 1.0 - MathUtil.zeroTolerance || duration === 0) && (crossWeight = 1.0);

    const { clipTime: destClipTime, playState } = destPlayData;
    const finished = playState === AnimatorStatePlayState.Finished;

    // When the animator is culled (aniUpdate=false), if the play state has finished, the final value needs to be calculated and saved to be applied directly
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
  }

  private _updateFinishedState(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    weight: number,
    additive: boolean,
    deltaTime: number,
    aniUpdate: boolean
  ): void {
    const { stateMachine } = layer;
    const playData = layerData.srcPlayData;
    const { state } = playData;
    const actualSpeed = state.speed * this.speed;
    const actualDeltaTime = actualSpeed * deltaTime;

    playData.updateOrientation(actualDeltaTime);

    const { clipTime, isForwards } = playData;

    const transition =
      this._applyTransitionsByCondition(
        layerIndex,
        layerData,
        layer,
        state,
        stateMachine.anyStateTransitions,
        aniUpdate
      ) ||
      this._applyStateTransitions(
        layerIndex,
        layerData,
        layer,
        isForwards,
        playData,
        state.transitions,
        clipTime,
        clipTime,
        actualDeltaTime,
        aniUpdate
      );

    if (transition) {
      this._updateState(layerIndex, layerData, layer, deltaTime, aniUpdate);
    } else {
      this._evaluateFinishedState(playData, weight, additive, aniUpdate);
    }
  }

  private _evaluateFinishedState(
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

  private _updateCrossFadeData(layerData: AnimatorLayerData): void {
    const { destPlayData } = layerData;
    if (destPlayData.playState === AnimatorStatePlayState.Finished) {
      layerData.layerState = LayerState.Finished;
    } else {
      layerData.layerState = LayerState.Playing;
    }
    layerData.switchPlayData();
    layerData.crossFadeTransition = null;
  }

  private _preparePlayOwner(layerData: AnimatorLayerData, playState: AnimatorState): void {
    if (layerData.layerState === LayerState.Playing) {
      const srcPlayData = layerData.srcPlayData;
      if (srcPlayData.state !== playState) {
        const { curveLayerOwner } = srcPlayData.stateData;
        for (let i = curveLayerOwner.length - 1; i >= 0; i--) {
          curveLayerOwner[i]?.curveOwner.revertDefaultValue();
        }
      }
    } else {
      const { crossLayerOwnerCollection } = layerData;
      for (let i = crossLayerOwnerCollection.length - 1; i >= 0; i--) {
        crossLayerOwnerCollection[i].curveOwner.revertDefaultValue();
      }
    }
  }

  private _applyStateTransitions(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    isForwards: boolean,
    playState: AnimatorStatePlayData,
    transitions: Readonly<AnimatorStateTransition[]>,
    lastClipTime: number,
    clipTime: number,
    deltaTime: number,
    aniUpdate: boolean
  ): AnimatorStateTransition {
    const { state } = playState;
    const clipDuration = state.clip.length;
    let targetTransition: AnimatorStateTransition = null;
    const startTime = state.clipStartTime * clipDuration;
    const endTime = state.clipEndTime * clipDuration;
    if (isForwards) {
      if (lastClipTime + deltaTime >= endTime) {
        targetTransition = this._checkSubTransition(
          layerIndex,
          layerData,
          layer,
          playState,
          transitions,
          lastClipTime,
          endTime,
          aniUpdate
        );
        if (!targetTransition) {
          playState.currentTransitionIndex = 0;
          targetTransition = this._checkSubTransition(
            layerIndex,
            layerData,
            layer,
            playState,
            transitions,
            startTime,
            clipTime,
            aniUpdate
          );
        }
      } else {
        targetTransition = this._checkSubTransition(
          layerIndex,
          layerData,
          layer,
          playState,
          transitions,
          lastClipTime,
          clipTime,
          aniUpdate
        );
      }
    } else {
      if (lastClipTime + deltaTime <= startTime) {
        targetTransition = this._checkBackwardsSubTransition(
          layerIndex,
          layerData,
          layer,
          playState,
          transitions,
          lastClipTime,
          startTime,
          aniUpdate
        );
        if (!targetTransition) {
          playState.currentTransitionIndex = transitions.length - 1;
          targetTransition = this._checkBackwardsSubTransition(
            layerIndex,
            layerData,
            layer,
            playState,
            transitions,
            clipTime,
            endTime,
            aniUpdate
          );
        }
      } else {
        targetTransition = this._checkBackwardsSubTransition(
          layerIndex,
          layerData,
          layer,
          playState,
          transitions,
          lastClipTime,
          clipTime,
          aniUpdate
        );
      }
    }

    return targetTransition;
  }

  private _checkSubTransition(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    playState: AnimatorStatePlayData,
    transitions: Readonly<AnimatorStateTransition[]>,
    lastClipTime: number,
    curClipTime: number,
    aniUpdate: boolean
  ): AnimatorStateTransition {
    const { state } = playState;
    let transitionIndex = playState.currentTransitionIndex;
    const duration = state._getDuration();
    for (let n = transitions.length; transitionIndex < n; transitionIndex++) {
      const transition = transitions[transitionIndex];
      const exitTime = transition.exitTime * duration;
      if (exitTime > curClipTime) {
        break;
      }

      if (exitTime >= lastClipTime) {
        playState.currentTransitionIndex = Math.min(transitionIndex + 1, n - 1);
        if (this._checkConditions(state, transition)) {
          if (this._applyTransition(layerIndex, layerData, layer, transition, aniUpdate)) {
            return transition;
          } else {
            return null;
          }
        }
      }
    }
    return null;
  }

  private _checkBackwardsSubTransition(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    playState: AnimatorStatePlayData,
    transitions: Readonly<AnimatorStateTransition[]>,
    lastClipTime: number,
    curClipTime: number,
    aniUpdate: boolean
  ): AnimatorStateTransition {
    const { state } = playState;
    let transitionIndex = playState.currentTransitionIndex;
    const duration = playState.state._getDuration();
    for (; transitionIndex >= 0; transitionIndex--) {
      const transition = transitions[transitionIndex];
      const exitTime = transition.exitTime * duration;
      if (exitTime < curClipTime) {
        break;
      }

      if (exitTime <= lastClipTime) {
        playState.currentTransitionIndex = Math.max(transitionIndex - 1, 0);
        if (this._checkConditions(state, transition)) {
          if (this._applyTransition(layerIndex, layerData, layer, transition, aniUpdate)) {
            return transition;
          } else {
            return null;
          }
        }
      }
    }
    return null;
  }

  private _applyTransitionsByCondition(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    state: AnimatorState,
    transitions: Readonly<AnimatorStateTransition[]>,
    aniUpdate: boolean
  ): AnimatorStateTransition {
    for (let i = 0, n = transitions.length; i < n; i++) {
      const transition = transitions[i];
      if (this._checkConditions(state, transition)) {
        if (this._applyTransition(layerIndex, layerData, layer, transition, aniUpdate)) {
          return transition;
        } else {
          return null;
        }
      }
    }
  }

  private _preparePlay(state: AnimatorState, layerIndex: number, normalizedTimeOffset: number = 0): boolean {
    const name = state.name;
    if (!state.clip) {
      Logger.warn(`The state named ${name} has no AnimationClip data.`);
      return false;
    }

    const animatorLayerData = this._getAnimatorLayerData(layerIndex);
    const animatorStateData = this._getAnimatorStateData(name, state, animatorLayerData, layerIndex);

    this._preparePlayOwner(animatorLayerData, state);

    animatorLayerData.layerState = LayerState.Playing;
    animatorLayerData.srcPlayData.reset(state, animatorStateData, state._getDuration() * normalizedTimeOffset);

    return true;
  }

  private _applyTransition(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    transition: AnimatorStateTransition,
    aniUpdate: boolean
  ): boolean {
    // Need prepare first, it should crossFade when to exit
    const success = this._prepareCrossFadeByTransition(transition, layerIndex);
    if (transition.isExit) {
      this._checkAnyAndEntryState(layerIndex, layerData, layer, 0, aniUpdate);
      return true;
    }
    return success;
  }

  private _checkConditions(state: AnimatorState, transition: AnimatorStateTransition): boolean {
    if (transition.mute) return false;

    if (state?._hasSoloTransition && !transition.solo) return false;

    const { conditions } = transition;

    let allPass = true;
    for (let i = 0, n = conditions.length; i < n; ++i) {
      let pass = false;
      const { mode, parameterName: name, threshold } = conditions[i];
      const parameterValue = this.getParameterValue(name);

      if (parameterValue === undefined) {
        return false;
      }

      switch (mode) {
        case AnimatorConditionMode.Equals:
          if (parameterValue === threshold) {
            pass = true;
          }
          break;
        case AnimatorConditionMode.Greater:
          if (parameterValue > threshold) {
            pass = true;
          }
          break;
        case AnimatorConditionMode.Less:
          if (parameterValue < threshold) {
            pass = true;
          }
          break;
        case AnimatorConditionMode.NotEquals:
          if (parameterValue !== threshold) {
            pass = true;
          }
          break;
        case AnimatorConditionMode.If:
          if (parameterValue === true) {
            pass = true;
          }
          break;
        case AnimatorConditionMode.IfNot:
          if (parameterValue === false) {
            pass = true;
          }
          break;
      }
      if (!pass) {
        allPass = false;
        break;
      }
    }
    return allPass;
  }

  private _prepareCrossFadeByTransition(transition: AnimatorStateTransition, layerIndex: number): boolean {
    const crossState = transition.destinationState;

    if (!crossState) {
      return false;
    }
    if (!crossState.clip) {
      Logger.warn(`The state named ${name} has no AnimationClip data.`);
      return false;
    }

    const animatorLayerData = this._getAnimatorLayerData(layerIndex);
    const animatorStateData = this._getAnimatorStateData(crossState.name, crossState, animatorLayerData, layerIndex);
    const duration = crossState._getDuration();
    const offset = duration * transition.offset;
    animatorLayerData.destPlayData.reset(crossState, animatorStateData, offset);

    switch (animatorLayerData.layerState) {
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
    playData: AnimatorStatePlayData,
    eventHandlers: AnimationEventHandler[],
    lastClipTime: number,
    deltaTime: number
  ): void {
    const { state, isForwards, clipTime } = playData;
    const clipDuration = state.clip.length;
    const startTime = state.clipStartTime * clipDuration;
    const endTime = state.clipEndTime * clipDuration;

    if (isForwards) {
      if (lastClipTime + deltaTime >= endTime) {
        this._fireSubAnimationEvents(playData, eventHandlers, lastClipTime, state.clipEndTime * clipDuration);
        playData.currentEventIndex = 0;
        this._fireSubAnimationEvents(playData, eventHandlers, state.clipStartTime * clipDuration, clipTime);
      } else {
        this._fireSubAnimationEvents(playData, eventHandlers, lastClipTime, clipTime);
      }
    } else {
      if (lastClipTime + deltaTime <= startTime) {
        this._fireBackwardSubAnimationEvents(playData, eventHandlers, lastClipTime, state.clipStartTime * clipDuration);
        playData.currentEventIndex = eventHandlers.length - 1;
        this._fireBackwardSubAnimationEvents(playData, eventHandlers, state.clipEndTime * clipDuration, clipTime);
      } else {
        this._fireBackwardSubAnimationEvents(playData, eventHandlers, lastClipTime, clipTime);
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

  private _checkAnyAndEntryState(
    layerIndex: number,
    layerData: AnimatorLayerData,
    layer: AnimatorControllerLayer,
    remainDeltaTime: number,
    aniUpdate: boolean
  ): void {
    const { stateMachine } = layer;
    const { anyStateTransitions, entryTransitions } = stateMachine;
    let transition: AnimatorStateTransition;

    transition =
      anyStateTransitions.length &&
      this._applyTransitionsByCondition(layerIndex, layerData, layer, null, anyStateTransitions, aniUpdate);

    if (!transition) {
      transition =
        entryTransitions.length &&
        this._applyTransitionsByCondition(layerIndex, layerData, layer, null, entryTransitions, aniUpdate);
    }

    if (transition) {
      this._updateState(layerIndex, layerData, layer, remainDeltaTime, aniUpdate);
    } else {
      const defaultState = stateMachine.defaultState;
      if (defaultState) {
        this._preparePlay(defaultState, layerIndex);
        this._updateState(layerIndex, layerData, layer, remainDeltaTime, aniUpdate);
      }
    }
  }

  private _checkRevertOwner(owner: AnimationCurveOwner<KeyframeValueType>, additive: boolean): void {
    if (additive && owner.updateMark !== this._updateMark) {
      owner.revertDefaultValue();
    }
    owner.updateMark = this._updateMark;
  }

  private _fireAnimationEventsAndCallScripts(
    layerIndex: number,
    playData: AnimatorStatePlayData,
    state: AnimatorState,
    lastClipTime: number,
    lastPlayState: AnimatorStatePlayState,
    deltaTime: number
  ) {
    const { eventHandlers } = playData.stateData;
    eventHandlers.length && this._fireAnimationEvents(playData, eventHandlers, lastClipTime, deltaTime);

    if (lastPlayState === AnimatorStatePlayState.UnStarted) {
      this._callAnimatorScriptOnEnter(state, layerIndex);
    }
    if (lastPlayState !== AnimatorStatePlayState.Finished && playData.playState === AnimatorStatePlayState.Finished) {
      this._callAnimatorScriptOnExit(state, layerIndex);
    } else {
      this._callAnimatorScriptOnUpdate(state, layerIndex);
    }
  }
}

interface IAnimatorStateInfo {
  layerIndex: number;
  state: AnimatorState;
}
