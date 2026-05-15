import { MathUtil } from "@galacean/engine-math";
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
import { AnimatorStateTransitionCollection } from "./AnimatorStateTransitionCollection";
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
import { AnimatorStateDef } from "./AnimatorStateDef";
import { AnimatorStateRuntime } from "./internal/AnimatorStateRuntime";
import { AnimationCurveOwner } from "./internal/animationCurveOwner/AnimationCurveOwner";

/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  private static _passedTriggerParameterNames = new Array<string>();

  /** Culling mode of this Animator. */
  cullingMode: AnimatorCullingMode = AnimatorCullingMode.None;
  /** The playback speed of the Animator, 1.0 is normal playback speed. */
  @assignmentClone
  speed = 1.0;

  /** @internal */
  _playFrameCount = -1;
  /** @internal */
  _onUpdateIndex = -1;

  @assignmentClone
  protected _animatorController: AnimatorController;
  @ignoreClone
  protected _controllerUpdateFlag: BoolUpdateFlag;
  @ignoreClone
  protected _updateMark = 0;

  @ignoreClone
  private _animatorLayersData = new Array<AnimatorLayerData>();
  @ignoreClone
  private _curveOwnerPool: Record<number, Record<string, AnimationCurveOwner<KeyframeValueType>>> = Object.create(null);
  @ignoreClone
  private _animationEventHandlerPool = new ClearableObjectPool(AnimationEventHandler);
  @ignoreClone
  private _parametersValueMap = <Record<string, AnimatorControllerParameterValue>>Object.create(null);

  @ignoreClone
  private _tempAnimatorStateInfo: IAnimatorStateInfo = { layerIndex: -1, state: null };

  @ignoreClone
  private _controlledRenderers = new Array<Renderer>();

  /**
   * All layers from the AnimatorController which belongs this Animator.
   */
  get animatorController(): AnimatorController {
    return this._animatorController;
  }

  set animatorController(animatorController: AnimatorController) {
    const lastController = this._animatorController;
    if (animatorController !== lastController) {
      lastController && this._addResourceReferCount(lastController, -1);
      this._controllerUpdateFlag && this._controllerUpdateFlag.destroy();
      this._reset();
      if (animatorController) {
        this._addResourceReferCount(animatorController, 1);
        this._controllerUpdateFlag = animatorController._registerChangeFlag();
        animatorController._setEngine(this.engine);
      }
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
   * @param normalizedTimeOffset - The normalized time offset (between 0 and 1, default 0) to start the state's animation from
   */
  play(stateName: string, layerIndex: number = -1, normalizedTimeOffset: number = 0): void {
    this._resetIfControllerUpdated();

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
   * Create a cross fade from the current state to another state with a normalized duration.
   * @param stateName - The state name
   * @param normalizedDuration - The normalized duration of the transition, relative to the destination state's duration (range: 0 to 1)
   * @param layerIndex - The layer index(default -1). If layer is -1, play the first state with the given state name
   * @param normalizedTimeOffset - The normalized time offset (between 0 and 1, default 0) to start the destination state's animation from
   */
  crossFade(
    stateName: string,
    normalizedDuration: number,
    layerIndex: number = -1,
    normalizedTimeOffset: number = 0
  ): void {
    this._crossFade(stateName, normalizedDuration, layerIndex, normalizedTimeOffset, false);
  }

  /**
   * Create a cross fade from the current state to another state with a fixed duration.
   * @param stateName - The state name
   * @param fixedDuration - The duration of the transition in seconds
   * @param layerIndex - The layer index(default -1). If layer is -1, play the first state with the given state name
   * @param normalizedTimeOffset - The normalized time offset (between 0 and 1, default 0) to start the destination state's animation from
   */
  crossFadeInFixedDuration(
    stateName: string,
    fixedDuration: number,
    layerIndex: number = -1,
    normalizedTimeOffset: number = 0
  ): void {
    this._crossFade(stateName, fixedDuration, layerIndex, normalizedTimeOffset, true);
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

    this._resetIfControllerUpdated();

    this._updateMark++;

    const { layers } = animatorController;
    for (let i = 0, n = layers.length; i < n; i++) {
      const layerData = this._getAnimatorLayerData(i);
      this._updateState(layerData, deltaTime, animationUpdate);
    }
  }

  /**
   * Get the per-Animator state view currently playing on the target layer.
   *
   * Writes on the returned `AnimatorState` (e.g. `state.speed`) only affect
   * this Animator; the shared `AnimatorStateDef` asset is untouched.
   *
   * @param layerIndex - The layer index
   * @returns Per-instance state view, or null if the layer is missing or no state is playing
   */
  getCurrentAnimatorState(layerIndex: number): AnimatorState | null {
    return this._animatorLayersData[layerIndex]?.srcRuntime?.state ?? null;
  }

  /**
   * Get or lazily create the per-Animator state view for a named state.
   *
   * Mirrors the `Renderer.getInstanceMaterial` pattern: the shared
   * `AnimatorStateDef` on the controller stays shared, while overrides on the
   * returned view (e.g. `state.speed`) only affect this Animator. The returned
   * view persists for the layer's lifetime, so overrides survive transitions
   * out of and back into the state.
   *
   * @param stateName - The state name
   * @param layerIndex - The layer index (default -1, searches all layers)
   * @returns Per-instance state view, or null if no state matches
   */
  findAnimatorState(stateName: string, layerIndex: number = -1): AnimatorState | null {
    this._resetIfControllerUpdated();
    const { state, layerIndex: foundLayer } = this._getAnimatorStateInfo(stateName, layerIndex);
    if (!state || foundLayer < 0) return null;
    return this._getAnimatorLayerData(foundLayer).getOrCreateRuntime(state).state;
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
  setParameterValue(name: string, value: AnimatorControllerParameterValue): void {
    const parameter = this._animatorController?._parametersMap[name];
    if (parameter) {
      this._parametersValueMap[name] = value;
    }
  }

  /**
   * Activate the trigger parameter by name.
   * @param name - The name of the trigger parameter
   */
  activateTriggerParameter(name: string): void {
    const parameter = this._animatorController?._parametersMap[name];

    if (parameter?._isTrigger) {
      this._parametersValueMap[name] = true;
    }
  }

  /**
   * Reset the trigger parameter to deactivate it by name.
   * @param name - The name of the trigger parameter
   */
  deactivateTriggerParameter(name: string): void {
    const parameter = this._animatorController?._parametersMap[name];

    if (parameter?._isTrigger) {
      this._parametersValueMap[name] = false;
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

    // Detach clipChangedListeners before dropping stateData; otherwise each
    // controller mutation would leave a dead listener attached to the
    // surviving AnimatorState's UpdateFlagManager.
    const layersData = this._animatorLayersData;
    for (let i = 0, n = layersData.length; i < n; i++) {
      const stateDataMap = layersData[i]?.animatorStateDataMap;
      if (!stateDataMap) continue;
      for (const stateName in stateDataMap) {
        stateDataMap[stateName].dispose();
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

  private _resetIfControllerUpdated(): void {
    if (this._controllerUpdateFlag?.flag) {
      this._reset();
    }
  }

  /**
   * @internal
   */
  _cloneTo(target: Animator): void {
    const animatorController = target._animatorController;
    if (animatorController) {
      target._addResourceReferCount(animatorController, 1);
      target._controllerUpdateFlag = animatorController._registerChangeFlag();
    }
  }

  protected override _onDestroy(): void {
    // Reuse _reset() to detach AnimatorStateData clipChangedListeners — without
    // this the listener closures stay attached to surviving AnimatorState
    // UpdateFlagManagers and keep referencing the destroyed entity / stateData.
    this._reset();
    super._onDestroy();
    const controller = this._animatorController;
    if (controller) {
      this._addResourceReferCount(controller, -1);
      this._controllerUpdateFlag?.destroy();
    }
  }

  private _crossFade(
    stateName: string,
    duration: number,
    layerIndex: number,
    normalizedTimeOffset: number,
    isFixedDuration: boolean
  ): void {
    this._resetIfControllerUpdated();

    const { state, layerIndex: playLayerIndex } = this._getAnimatorStateInfo(stateName, layerIndex);
    if (!state || playLayerIndex < 0) {
      return;
    }
    const { manuallyTransition } = this._getAnimatorLayerData(playLayerIndex);
    manuallyTransition.duration = duration;

    manuallyTransition.offset = normalizedTimeOffset;
    manuallyTransition.isFixedDuration = isFixedDuration;
    manuallyTransition.destinationState = state;

    if (this._prepareCrossFadeByTransition(manuallyTransition, playLayerIndex)) {
      this._playFrameCount = this.engine.time.frameCount;
    }
  }

  private _getAnimatorStateInfo(stateName: string, layerIndex: number): IAnimatorStateInfo {
    const { _animatorController: animatorController, _tempAnimatorStateInfo: stateInfo } = this;
    let state: AnimatorStateDef = null;
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
      } else if (layerIndex >= 0 && layerIndex < layers.length) {
        state = layers[layerIndex].stateMachine.findStateByName(stateName);
      } else {
        layerIndex = -1;
      }
    }
    stateInfo.layerIndex = layerIndex;
    stateInfo.state = state;
    return stateInfo;
  }

  private _getAnimatorStateData(
    stateName: string,
    animatorState: AnimatorStateDef,
    animatorLayerData: AnimatorLayerData,
    layerIndex: number
  ): AnimatorStateData {
    const { animatorStateDataMap } = animatorLayerData;
    let animatorStateData = animatorStateDataMap[stateName];
    if (animatorStateData && animatorStateData.state !== animatorState) {
      // Same name but different state instance (e.g. removeState + addState same name):
      // detach the old listener and rebuild stateData against the new state.
      animatorStateData.dispose();
      animatorStateData = null;
    }
    if (!animatorStateData) {
      animatorStateData = new AnimatorStateData(animatorState);
      animatorStateDataMap[stateName] = animatorStateData;
      this._saveAnimatorStateData(animatorState, animatorStateData, animatorLayerData, layerIndex);
      this._saveAnimatorEventHandlers(animatorState, animatorStateData);
    }
    return animatorStateData;
  }

  private _saveAnimatorStateData(
    animatorState: AnimatorStateDef,
    animatorStateData: AnimatorStateData,
    animatorLayerData: AnimatorLayerData,
    layerIndex: number
  ): void {
    const { entity, _curveOwnerPool: curveOwnerPool } = this;
    let { mask } = this._animatorController.layers[layerIndex];
    const { curveLayerOwner } = animatorStateData;
    const { _curveBindings: curves } = animatorState.clip;

    const { curveOwnerPool: layerCurveOwnerPool } = animatorLayerData;
    const components = AnimationCurveOwner._components;
    for (let i = curves.length - 1; i >= 0; i--) {
      const curve = curves[i];
      const { relativePath } = curve;
      const targetEntity = curve.relativePath === "" ? entity : entity.findByPath(curve.relativePath);
      if (targetEntity) {
        const component =
          curve.typeIndex > 0
            ? targetEntity.getComponents(curve.type, components)[curve.typeIndex]
            : targetEntity.getComponent(curve.type);
        components.length = 0;
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

  private _saveAnimatorEventHandlers(state: AnimatorStateDef, animatorStateData: AnimatorStateData): void {
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
          const handler = <Function>script[funcName]?.bind(script);
          handler && handlers.push(handler);
        }
        eventHandlers.push(eventHandler);
      }
    };
    clipChangedListener();
    state._updateFlagManager.addListener(clipChangedListener);
    animatorStateData.clipChangedListener = clipChangedListener;
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
    // Standby have two sub state, one is never play (srcRuntime is null), one is finished (srcRuntime is non-null)
    animatorLayerData.srcRuntime && this._prepareSrcCrossData(animatorLayerData, true);
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
    const { curveLayerOwner } = animatorLayerData.srcRuntime.stateData;
    for (let i = curveLayerOwner.length - 1; i >= 0; i--) {
      const layerOwner = curveLayerOwner[i];
      if (!layerOwner) continue;
      layerOwner.crossCurveMark = animatorLayerData.crossCurveMark;
      saveFixed && layerOwner.curveOwner.saveFixedPoseValue();
      this._addCrossOwner(animatorLayerData, layerOwner, i, -1);
    }
  }

  private _prepareDestCrossData(animatorLayerData: AnimatorLayerData, saveFixed: boolean): void {
    const { curveLayerOwner } = animatorLayerData.destRuntime.stateData;
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
    if (!animatorLayerData) {
      animatorLayerData = new AnimatorLayerData();
      animatorLayerData.layerIndex = layerIndex;
      animatorLayerData.layer = this._animatorController.layers[layerIndex];
      this._animatorLayersData[layerIndex] = animatorLayerData;
    }
    return animatorLayerData;
  }

  private _updateState(layerData: AnimatorLayerData, deltaTime: number, aniUpdate: boolean): void {
    const { layer } = layerData;
    let { weight } = layer;
    const additive = layer.blendingMode === AnimatorLayerBlendingMode.Additive;

    layerData.layerIndex === 0 && (weight = 1.0);

    switch (layerData.layerState) {
      case LayerState.Standby:
        this._checkAnyAndEntryState(layerData, deltaTime, aniUpdate);
        break;
      case LayerState.Playing:
        this._updatePlayingState(layerData, weight, additive, deltaTime, aniUpdate);
        break;
      case LayerState.Finished:
        this._updateFinishedState(layerData, weight, additive, deltaTime, aniUpdate);
        break;
      case LayerState.CrossFading:
        this._updateCrossFadeState(layerData, weight, additive, deltaTime, aniUpdate);
        break;
      case LayerState.FixedCrossFading:
        this._updateCrossFadeFromPoseState(layerData, weight, additive, deltaTime, aniUpdate);
        break;
    }
  }

  private _updatePlayingState(
    layerData: AnimatorLayerData,
    weight: number,
    additive: boolean,
    deltaTime: number,
    aniUpdate: boolean
  ): void {
    const { srcRuntime } = layerData;
    const state = srcRuntime.state.def;

    const playSpeed = srcRuntime.state.speed * this.speed;
    const playDeltaTime = playSpeed * deltaTime;

    srcRuntime.updateOrientation(playDeltaTime);

    const { clipTime: lastClipTime, playState: lastPlayState } = srcRuntime;

    // Precalculate to get the transition
    srcRuntime.update(playDeltaTime);

    const { clipTime: clipTime, isForward: isForward } = srcRuntime;
    const { _transitionCollection: transitions } = state;
    const { _anyStateTransitionCollection: anyStateTransitions } = layerData.layer.stateMachine;

    const transition =
      (anyStateTransitions.count &&
        this._applyStateTransitions(
          layerData,
          isForward,
          srcRuntime,
          anyStateTransitions,
          lastClipTime,
          clipTime,
          playDeltaTime,
          aniUpdate
        )) ||
      (transitions.count &&
        this._applyStateTransitions(
          layerData,
          isForward,
          srcRuntime,
          transitions,
          lastClipTime,
          clipTime,
          playDeltaTime,
          aniUpdate
        ));

    let playCostTime: number;
    if (transition) {
      const clipEndTime = state._getClipActualEndTime();

      if (transition.hasExitTime) {
        const exitTime = transition.exitTime * state._getDuration() + state._getClipActualStartTime();

        if (isForward) {
          if (exitTime < lastClipTime) {
            playCostTime = exitTime + clipEndTime - lastClipTime;
          } else {
            playCostTime = exitTime - lastClipTime;
          }
        } else {
          const startTime = state._getClipActualStartTime();
          if (lastClipTime < exitTime) {
            playCostTime = clipEndTime - exitTime + lastClipTime - startTime;
          } else {
            playCostTime = lastClipTime - exitTime;
          }
          playCostTime = -playCostTime;
        }
      } else {
        playCostTime = 0;
      }
      // Revert actualDeltaTime and update playCostTime
      srcRuntime.update(playCostTime - playDeltaTime);
    } else {
      playCostTime = playDeltaTime;
      if (srcRuntime.playState === AnimatorStatePlayState.Finished) {
        layerData.layerState = LayerState.Finished;
      }
    }

    this._evaluatePlayingState(srcRuntime, weight, additive, aniUpdate);
    this._fireAnimationEventsAndCallScripts(
      layerData.layerIndex,
      srcRuntime,
      state,
      lastClipTime,
      lastPlayState,
      playCostTime
    );

    if (transition) {
      // Remove speed factor, use actual cost time. Per-instance speed=0 means the source
      // state is paused, so it consumes no time — pass deltaTime through to the destination.
      const remainDeltaTime = playSpeed === 0 ? deltaTime : deltaTime - playCostTime / playSpeed;
      remainDeltaTime > 0 && this._updateState(layerData, remainDeltaTime, aniUpdate);
    }
  }

  private _evaluatePlayingState(
    runtime: AnimatorStateRuntime,
    weight: number,
    additive: boolean,
    aniUpdate: boolean
  ): void {
    const curveBindings = runtime.state.clip._curveBindings;
    const finished = runtime.playState === AnimatorStatePlayState.Finished;

    if (aniUpdate || finished) {
      const curveLayerOwner = runtime.stateData.curveLayerOwner;
      for (let i = curveBindings.length - 1; i >= 0; i--) {
        const layerOwner = curveLayerOwner[i];
        const owner = layerOwner?.curveOwner;

        if (!owner || !layerOwner.isActive) {
          continue;
        }

        const curve = curveBindings[i].curve;
        if (curve.keys.length) {
          this._checkRevertOwner(owner, additive);

          const value = owner.evaluateValue(curve, runtime.clipTime, additive);
          aniUpdate && owner.applyValue(value, weight, additive);
          finished && layerOwner.saveFinalValue();
        }
      }
    }
  }

  private _updateCrossFadeState(
    layerData: AnimatorLayerData,
    weight: number,
    additive: boolean,
    deltaTime: number,
    aniUpdate: boolean
  ) {
    const { srcRuntime, destRuntime, layerIndex } = layerData;
    const { speed } = this;
    const srcState = srcRuntime.state.def;
    const destState = destRuntime.state.def;
    const transitionDuration = layerData.crossFadeTransition._getFixedDuration();

    if (this._tryCrossFadeInterrupt(layerData, transitionDuration, destState, deltaTime, aniUpdate)) {
      return;
    }

    const srcPlaySpeed = srcRuntime.state.speed * speed;
    const dstPlaySpeed = destRuntime.state.speed * speed;
    const dstPlayDeltaTime = dstPlaySpeed * deltaTime;

    srcRuntime.updateOrientation(srcPlaySpeed * deltaTime);
    destRuntime.updateOrientation(dstPlayDeltaTime);

    const { clipTime: lastSrcClipTime, playState: lastSrcPlayState } = srcRuntime;
    const { clipTime: lastDestClipTime, playState: lastDstPlayState } = destRuntime;

    let dstPlayCostTime: number;
    if (destRuntime.isForward) {
      // The time that has been played
      const playedTime = destRuntime.playedTime;
      dstPlayCostTime =
        playedTime + dstPlayDeltaTime > transitionDuration ? transitionDuration - playedTime : dstPlayDeltaTime;
    } else {
      // The time that has been played
      const playedTime = destRuntime.playedTime;
      dstPlayCostTime =
        // -dstPlayDeltaTime: The time that will be played, negative are meant to make it be a periods
        // > transition: The time that will be played is enough to finish the transition
        playedTime - dstPlayDeltaTime > transitionDuration
          ? // Negative number is used to convert a time period into a reverse deltaTime.
            // -(transitionDuration - playedTime)
            playedTime - transitionDuration
          : dstPlayDeltaTime;
    }

    const actualCostTime = dstPlaySpeed === 0 ? deltaTime : dstPlayCostTime / dstPlaySpeed;
    const srcPlayCostTime = actualCostTime * srcPlaySpeed;

    srcRuntime.update(srcPlayCostTime);
    destRuntime.update(dstPlayCostTime);

    let crossWeight = Math.abs(destRuntime.playedTime) / transitionDuration;
    (crossWeight >= 1.0 - MathUtil.zeroTolerance || transitionDuration === 0) && (crossWeight = 1.0);

    const crossFadeFinished = crossWeight === 1.0;

    if (crossFadeFinished) {
      srcRuntime.playState = AnimatorStatePlayState.Finished;
      this._preparePlayOwner(layerData, destState);
      this._evaluatePlayingState(destRuntime, weight, additive, aniUpdate);
    } else {
      this._evaluateCrossFadeState(layerData, srcRuntime, destRuntime, weight, crossWeight, additive, aniUpdate);
    }

    this._fireAnimationEventsAndCallScripts(
      layerIndex,
      srcRuntime,
      srcState,
      lastSrcClipTime,
      lastSrcPlayState,
      srcPlayCostTime
    );

    this._fireAnimationEventsAndCallScripts(
      layerIndex,
      destRuntime,
      destState,
      lastDestClipTime,
      lastDstPlayState,
      dstPlayCostTime
    );

    if (crossFadeFinished) {
      this._updateCrossFadeData(layerData);
      const remainDeltaTime = deltaTime - actualCostTime;
      remainDeltaTime > 0 && this._updateState(layerData, remainDeltaTime, aniUpdate);
    }
  }

  private _evaluateCrossFadeState(
    layerData: AnimatorLayerData,
    srcRuntime: AnimatorStateRuntime,
    destRuntime: AnimatorStateRuntime,
    weight: number,
    crossWeight: number,
    additive: boolean,
    aniUpdate: boolean
  ) {
    const { crossLayerOwnerCollection } = layerData;
    const { _curveBindings: srcCurves } = srcRuntime.state.clip;
    const { state: destState } = destRuntime;
    const { _curveBindings: destCurves } = destState.clip;

    const finished = destRuntime.playState === AnimatorStatePlayState.Finished;

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
          srcRuntime.clipTime,
          destRuntime.clipTime,
          crossWeight,
          additive
        );
        aniUpdate && owner.applyValue(value, weight, additive);
        finished && layerOwner.saveFinalValue();
      }
    }
  }

  private _updateCrossFadeFromPoseState(
    layerData: AnimatorLayerData,
    weight: number,
    additive: boolean,
    deltaTime: number,
    aniUpdate: boolean
  ) {
    const { destRuntime } = layerData;
    const state = destRuntime.state.def;
    const transitionDuration = layerData.crossFadeTransition._getFixedDuration();

    if (this._tryCrossFadeInterrupt(layerData, transitionDuration, state, deltaTime, aniUpdate)) {
      return;
    }

    const playSpeed = destRuntime.state.speed * this.speed;
    const playDeltaTime = playSpeed * deltaTime;

    destRuntime.updateOrientation(playDeltaTime);

    const { clipTime: lastDestClipTime, playState: lastPlayState } = destRuntime;

    let dstPlayCostTime: number;
    if (destRuntime.isForward) {
      // The time that has been played
      const playedTime = destRuntime.playedTime;
      dstPlayCostTime =
        playedTime + playDeltaTime > transitionDuration ? transitionDuration - playedTime : playDeltaTime;
    } else {
      // The time that has been played
      const playedTime = destRuntime.playedTime;
      dstPlayCostTime =
        // -playDeltaTime: The time that will be played, negative are meant to make it be a periods
        // > transition: The time that will be played is enough to finish the transition
        playedTime - playDeltaTime > transitionDuration
          ? // Negative number is used to convert a time period into a reverse deltaTime.
            // -(transitionDuration - playedTime)
            playedTime - transitionDuration
          : playDeltaTime;
    }

    const actualCostTime = playSpeed === 0 ? deltaTime : dstPlayCostTime / playSpeed;

    destRuntime.update(dstPlayCostTime);

    let crossWeight = Math.abs(destRuntime.playedTime) / transitionDuration;
    (crossWeight >= 1.0 - MathUtil.zeroTolerance || transitionDuration === 0) && (crossWeight = 1.0);

    const crossFadeFinished = crossWeight === 1.0;

    if (crossFadeFinished) {
      this._preparePlayOwner(layerData, state);
      this._evaluatePlayingState(destRuntime, weight, additive, aniUpdate);
    } else {
      this._evaluateCrossFadeFromPoseState(layerData, destRuntime, weight, crossWeight, additive, aniUpdate);
    }

    this._fireAnimationEventsAndCallScripts(
      layerData.layerIndex,
      destRuntime,
      state,
      lastDestClipTime,
      lastPlayState,
      dstPlayCostTime
    );

    if (crossFadeFinished) {
      this._updateCrossFadeData(layerData);
      const remainDeltaTime = deltaTime - actualCostTime;
      remainDeltaTime > 0 && this._updateState(layerData, remainDeltaTime, aniUpdate);
    }
  }

  private _evaluateCrossFadeFromPoseState(
    layerData: AnimatorLayerData,
    destRuntime: AnimatorStateRuntime,
    weight: number,
    crossWeight: number,
    additive: boolean,
    aniUpdate: boolean
  ) {
    const { crossLayerOwnerCollection } = layerData;
    const { state } = destRuntime;
    const { _curveBindings: curveBindings } = state.clip;

    const { clipTime: destClipTime, playState: playState } = destRuntime;
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
    layerData: AnimatorLayerData,
    weight: number,
    additive: boolean,
    deltaTime: number,
    aniUpdate: boolean
  ): void {
    const runtime = layerData.srcRuntime;
    const state = runtime.state.def;
    const actualSpeed = runtime.state.speed * this.speed;
    const actualDeltaTime = actualSpeed * deltaTime;

    runtime.updateOrientation(actualDeltaTime);

    const { clipTime: clipTime, isForward: isForward } = runtime;
    const { _transitionCollection: transitions } = state;
    const { _anyStateTransitionCollection: anyStateTransitions } = layerData.layer.stateMachine;

    const transition =
      (anyStateTransitions.count && this._applyTransitionsByCondition(layerData, anyStateTransitions, aniUpdate)) ||
      (transitions.count &&
        this._applyStateTransitions(
          layerData,
          isForward,
          runtime,
          transitions,
          clipTime,
          clipTime,
          actualDeltaTime,
          aniUpdate
        ));

    if (transition) {
      this._updateState(layerData, deltaTime, aniUpdate);
    } else {
      this._evaluateFinishedState(runtime, weight, additive, aniUpdate);
    }
  }

  private _evaluateFinishedState(
    runtime: AnimatorStateRuntime,
    weight: number,
    additive: boolean,
    aniUpdate: boolean
  ): void {
    if (!aniUpdate) {
      return;
    }

    const { curveLayerOwner } = runtime.stateData;
    const { _curveBindings: curveBindings } = runtime.state.clip;

    for (let i = curveBindings.length - 1; i >= 0; i--) {
      const layerOwner = curveLayerOwner[i];
      const owner = layerOwner?.curveOwner;

      if (!owner) continue;

      this._checkRevertOwner(owner, additive);

      owner.applyValue(layerOwner.finalValue, weight, additive);
    }
  }

  private _updateCrossFadeData(layerData: AnimatorLayerData): void {
    const { destRuntime } = layerData;
    if (destRuntime.playState === AnimatorStatePlayState.Finished) {
      layerData.layerState = LayerState.Finished;
    } else {
      layerData.layerState = LayerState.Playing;
    }
    layerData.promoteDest();
    layerData.crossFadeTransition = null;
  }

  private _preparePlayOwner(layerData: AnimatorLayerData, playState: AnimatorStateDef): void {
    if (layerData.layerState === LayerState.Playing) {
      const srcRuntime = layerData.srcRuntime;
      if (srcRuntime.state.def !== playState) {
        const { curveLayerOwner } = srcRuntime.stateData;
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
    layerData: AnimatorLayerData,
    isForward: boolean,
    runtime: AnimatorStateRuntime,
    transitionCollection: AnimatorStateTransitionCollection,
    lastClipTime: number,
    clipTime: number,
    deltaTime: number,
    aniUpdate: boolean
  ): AnimatorStateTransition {
    const state = runtime.state.def;
    const clipDuration = state.clip.length;
    let targetTransition: AnimatorStateTransition = null;
    const startTime = state.clipStartTime * clipDuration;
    const endTime = state.clipEndTime * clipDuration;

    if (transitionCollection.noExitTimeCount) {
      targetTransition = this._checkNoExitTimeTransitions(layerData, transitionCollection, aniUpdate);
      if (targetTransition) {
        return targetTransition;
      }
    }

    if (isForward) {
      if (lastClipTime + deltaTime >= endTime) {
        targetTransition = this._checkSubTransition(
          layerData,
          state,
          transitionCollection,
          lastClipTime,
          endTime,
          aniUpdate
        );
        if (!targetTransition) {
          transitionCollection.needResetCurrentCheckIndex = true;
          targetTransition = this._checkSubTransition(
            layerData,
            state,
            transitionCollection,
            startTime,
            clipTime,
            aniUpdate
          );
        }
      } else {
        targetTransition = this._checkSubTransition(
          layerData,
          state,
          transitionCollection,
          lastClipTime,
          clipTime,
          aniUpdate
        );
      }
    } else {
      //@todo backwards play currentIndex should not be 0
      if (lastClipTime + deltaTime <= startTime) {
        targetTransition = this._checkBackwardsSubTransition(
          layerData,
          state,
          transitionCollection,
          lastClipTime,
          startTime,
          aniUpdate
        );
        if (!targetTransition) {
          transitionCollection.needResetCurrentCheckIndex = true;
          targetTransition = this._checkBackwardsSubTransition(
            layerData,
            state,
            transitionCollection,
            clipTime,
            endTime,
            aniUpdate
          );
        }
      } else {
        targetTransition = this._checkBackwardsSubTransition(
          layerData,
          state,
          transitionCollection,
          lastClipTime,
          clipTime,
          aniUpdate
        );
      }
    }

    return targetTransition;
  }

  private _tryCrossFadeInterrupt(
    layerData: AnimatorLayerData,
    transitionDuration: number,
    currentDestState: AnimatorStateDef,
    deltaTime: number,
    aniUpdate: boolean
  ): boolean {
    if (transitionDuration > 0) {
      const { _anyStateTransitionCollection: anyStateTransitions } = layerData.layer.stateMachine;
      if (
        anyStateTransitions.noExitTimeCount &&
        this._checkNoExitTimeTransitions(layerData, anyStateTransitions, aniUpdate, currentDestState)
      ) {
        this._updateState(layerData, deltaTime, aniUpdate);
        return true;
      }
    }
    return false;
  }

  private _checkNoExitTimeTransitions(
    layerData: AnimatorLayerData,
    transitionCollection: AnimatorStateTransitionCollection,
    aniUpdate: boolean,
    excludeDestState?: AnimatorStateDef
  ): AnimatorStateTransition {
    for (let i = 0, n = transitionCollection.noExitTimeCount; i < n; ++i) {
      const transition = transitionCollection.get(i);
      // Skip if destination is same as current state (equivalent to Unity's canTransitionToSelf=false)
      // TODO: Support canTransitionToSelf option on AnimatorStateTransition
      if (excludeDestState && transition.destinationState === excludeDestState) continue;
      if (
        transition.mute ||
        (transitionCollection.isSoloMode && !transition.solo) ||
        !this._checkConditions(transition)
      )
        continue;

      return this._applyTransition(layerData, transition, aniUpdate);
    }
    return null;
  }

  private _checkSubTransition(
    layerData: AnimatorLayerData,
    state: AnimatorStateDef,
    transitionCollection: AnimatorStateTransitionCollection,
    lastClipTime: number,
    curClipTime: number,
    aniUpdate: boolean
  ): AnimatorStateTransition {
    if (transitionCollection.needResetCurrentCheckIndex) transitionCollection.resetCurrentCheckIndex(true);

    const { transitions } = transitionCollection;
    let transitionIndex = transitionCollection.noExitTimeCount + transitionCollection.currentCheckIndex;
    for (let n = transitions.length; transitionIndex < n; transitionIndex++) {
      const transition = transitions[transitionIndex];
      const exitTime = transition.exitTime * state._getDuration() + state._getClipActualStartTime();

      if (exitTime > curClipTime) {
        break;
      }

      if (exitTime < lastClipTime) continue;

      transitionCollection.updateCurrentCheckIndex(true);

      if (
        transition.mute ||
        (transitionCollection.isSoloMode && !transition.solo) ||
        !this._checkConditions(transition)
      ) {
        continue;
      }

      return this._applyTransition(layerData, transition, aniUpdate);
    }
    return null;
  }

  private _checkBackwardsSubTransition(
    layerData: AnimatorLayerData,
    state: AnimatorStateDef,
    transitionCollection: AnimatorStateTransitionCollection,
    lastClipTime: number,
    curClipTime: number,
    aniUpdate: boolean
  ): AnimatorStateTransition {
    if (transitionCollection.needResetCurrentCheckIndex) transitionCollection.resetCurrentCheckIndex(false);

    const { transitions, noExitTimeCount } = transitionCollection;
    let transitionIndex = transitionCollection.currentCheckIndex + noExitTimeCount;
    for (; transitionIndex >= noExitTimeCount; transitionIndex--) {
      const transition = transitions[transitionIndex];
      const exitTime = transition.exitTime * state._getDuration() + state._getClipActualStartTime();

      if (exitTime < curClipTime) {
        break;
      }

      if (exitTime > lastClipTime) continue;

      transitionCollection.updateCurrentCheckIndex(false);

      if (
        transition.mute ||
        (transitionCollection.isSoloMode && !transition.solo) ||
        !this._checkConditions(transition)
      ) {
        continue;
      }

      return this._applyTransition(layerData, transition, aniUpdate);
    }
    return null;
  }

  private _applyTransitionsByCondition(
    layerData: AnimatorLayerData,
    transitionCollection: AnimatorStateTransitionCollection,
    aniUpdate: boolean
  ): AnimatorStateTransition {
    for (let i = 0, n = transitionCollection.count; i < n; i++) {
      const transition = transitionCollection.get(i);

      if (transition.mute) continue;

      if (transitionCollection.isSoloMode && !transition.solo) continue;

      if (this._checkConditions(transition)) {
        return this._applyTransition(layerData, transition, aniUpdate);
      }
    }
  }

  private _preparePlay(state: AnimatorStateDef, layerIndex: number, normalizedTimeOffset: number = 0): boolean {
    const name = state.name;
    if (!state.clip) {
      Logger.warn(`The state named ${name} has no AnimationClip data.`);
      return false;
    }

    const animatorLayerData = this._getAnimatorLayerData(layerIndex);
    const animatorStateData = this._getAnimatorStateData(name, state, animatorLayerData, layerIndex);

    this._preparePlayOwner(animatorLayerData, state);

    animatorLayerData.layerState = LayerState.Playing;
    const runtime = animatorLayerData.getOrCreateRuntime(state);
    runtime.resetForPlay(animatorStateData, state._getClipActualEndTime() * normalizedTimeOffset);
    animatorLayerData.srcRuntime = runtime;
    // Clear any stale cross-fade slot from a previously-interrupted crossFade so
    // subsequent crossFade() calls aren't no-op'd by the self-target alias guard.
    animatorLayerData.destRuntime = null;
    animatorLayerData.crossFadeTransition = null;
    animatorLayerData.resetCurrentCheckIndex();

    return true;
  }

  private _applyTransition(
    layerData: AnimatorLayerData,
    transition: AnimatorStateTransition,
    aniUpdate: boolean
  ): AnimatorStateTransition {
    if (transition.isExit) {
      this._checkAnyAndEntryState(layerData, 0, aniUpdate);
      return null;
    }
    return this._prepareCrossFadeByTransition(transition, layerData.layerIndex) ? transition : null;
  }

  private _checkConditions(transition: AnimatorStateTransition): boolean {
    const { conditions } = transition;
    let allPass = true;
    for (let i = 0, n = conditions.length; i < n; ++i) {
      let pass = false;
      const { mode, parameterName: name, threshold } = conditions[i];
      const parameterValue = this.getParameterValue(name);

      if (parameterValue === undefined) {
        return false;
      }

      if (parameterValue === true) {
        const parameter = this.getParameter(name);
        if (parameter?._isTrigger) {
          Animator._passedTriggerParameterNames.push(name);
          pass = true;
        }
      }

      if (!pass) {
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
      }

      if (!pass) {
        allPass = false;
        break;
      }
    }

    if (allPass) {
      this._deactivateTriggeredParameters();
    }

    Animator._passedTriggerParameterNames.length = 0;

    return allPass;
  }

  private _prepareCrossFadeByTransition(transition: AnimatorStateTransition, layerIndex: number): boolean {
    const crossState = transition.destinationState;

    if (!crossState) {
      return false;
    }
    if (!crossState.clip) {
      Logger.warn(`The state named ${crossState.name} has no AnimationClip data.`);
      return false;
    }

    const animatorLayerData = this._getAnimatorLayerData(layerIndex);

    // Self/active-dest cross-fade is intentionally a no-op because each def
    // owns one persistent state view per layer (so per-instance overrides
    // like speed survive transitions). Supporting self cross-fade would require
    // a separate transient playback track per active fade.
    if (
      animatorLayerData.srcRuntime?.state.def === crossState ||
      animatorLayerData.destRuntime?.state.def === crossState
    ) {
      return false;
    }

    const animatorStateData = this._getAnimatorStateData(crossState.name, crossState, animatorLayerData, layerIndex);

    const destRuntime = animatorLayerData.getOrCreateRuntime(crossState);
    destRuntime.resetForPlay(animatorStateData, transition.offset * crossState._getClipActualEndTime());
    animatorLayerData.destRuntime = destRuntime;
    animatorLayerData.resetCurrentCheckIndex();

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
    runtime: AnimatorStateRuntime,
    eventHandlers: AnimationEventHandler[],
    lastClipTime: number,
    deltaTime: number
  ): void {
    const { isForward, clipTime } = runtime;
    const state = runtime.state.def;
    const startTime = state._getClipActualStartTime();
    const endTime = state._getClipActualEndTime();

    if (isForward) {
      if (lastClipTime + deltaTime >= endTime) {
        this._fireSubAnimationEvents(runtime, eventHandlers, lastClipTime, endTime);
        runtime.currentEventIndex = 0;
        this._fireSubAnimationEvents(runtime, eventHandlers, startTime, clipTime);
      } else {
        this._fireSubAnimationEvents(runtime, eventHandlers, lastClipTime, clipTime);
      }
    } else {
      if (lastClipTime + deltaTime <= startTime) {
        this._fireBackwardSubAnimationEvents(runtime, eventHandlers, lastClipTime, startTime);
        runtime.currentEventIndex = eventHandlers.length - 1;
        this._fireBackwardSubAnimationEvents(runtime, eventHandlers, endTime, clipTime);
      } else {
        this._fireBackwardSubAnimationEvents(runtime, eventHandlers, lastClipTime, clipTime);
      }
    }
  }

  private _fireSubAnimationEvents(
    playState: AnimatorStateRuntime,
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
    playState: AnimatorStateRuntime,
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

  private _checkAnyAndEntryState(layerData: AnimatorLayerData, remainDeltaTime: number, aniUpdate: boolean): void {
    const { stateMachine } = layerData.layer;
    const { _anyStateTransitionCollection: anyStateTransitions, _entryTransitionCollection: entryTransitions } =
      stateMachine;
    let transition: AnimatorStateTransition;

    transition =
      anyStateTransitions.count && this._applyTransitionsByCondition(layerData, anyStateTransitions, aniUpdate);

    if (!transition) {
      transition = entryTransitions.count && this._applyTransitionsByCondition(layerData, entryTransitions, aniUpdate);
    }

    if (transition) {
      this._updateState(layerData, remainDeltaTime, aniUpdate);
    } else {
      const defaultState = stateMachine.defaultState;
      if (defaultState) {
        this._preparePlay(defaultState, layerData.layerIndex);
        this._updateState(layerData, remainDeltaTime, aniUpdate);
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
    runtime: AnimatorStateRuntime,
    state: AnimatorStateDef,
    lastClipTime: number,
    lastPlayState: AnimatorStatePlayState,
    deltaTime: number
  ) {
    const { eventHandlers } = runtime.stateData;
    eventHandlers.length && this._fireAnimationEvents(runtime, eventHandlers, lastClipTime, deltaTime);

    if (lastPlayState === AnimatorStatePlayState.UnStarted) {
      state._callOnEnter(this, layerIndex);
    }
    if (lastPlayState !== AnimatorStatePlayState.Finished && runtime.playState === AnimatorStatePlayState.Finished) {
      state._callOnExit(this, layerIndex);
    } else {
      state._callOnUpdate(this, layerIndex);
    }
  }

  private _deactivateTriggeredParameters(): void {
    const passedTriggerParameterNames = Animator._passedTriggerParameterNames;
    for (let i = 0, n = passedTriggerParameterNames.length; i < n; i++) {
      this._parametersValueMap[passedTriggerParameterNames[i]] = false;
    }
  }
}

interface IAnimatorStateInfo {
  layerIndex: number;
  state: AnimatorStateDef;
}
