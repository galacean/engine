import { Quaternion, Vector3 } from "@oasis-engine/math";
import { assignmentClone, ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { SkinnedMeshRenderer } from "../mesh";
import { ClassPool } from "../RenderPipeline/ClassPool";
import { Transform } from "../Transform";
import { UpdateFlag } from "../UpdateFlag";
import { AnimationCurve } from "./AnimationCurve";
import { AnimatorController } from "./AnimatorController";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { AnimatorUtils } from "./AnimatorUtils";
import { AnimationProperty } from "./enums/AnimationProperty";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { LayerState } from "./enums/LayerState";
import { AnimationCurveOwner } from "./internal/AnimationCurveOwner";
import { AnimationEventHandler } from "./internal/AnimationEventHandler";
import { AnimatorLayerData } from "./internal/AnimatorLayerData";
import { AnimatorStateData } from "./internal/AnimatorStateData";
import { AnimatorStateInfo } from "./internal/AnimatorStateInfo";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";
import { CrossCurveData } from "./internal/CrossCurveData";
import { InterpolableValue, UnionInterpolableKeyframe } from "./KeyFrame";

/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  private static _tempVector3: Vector3 = new Vector3();
  private static _tempQuaternion: Quaternion = new Quaternion();
  private static _animatorInfo: AnimatorStateInfo = new AnimatorStateInfo();

  protected _animatorController: AnimatorController;
  @assignmentClone
  protected _speed: number = 1.0;
  @ignoreClone
  protected _controllerUpdateFlag: UpdateFlag;

  @ignoreClone
  private _animatorLayersData: AnimatorLayerData[] = [];
  @ignoreClone
  private _crossCurveDataCollection: CrossCurveData[] = [];
  @ignoreClone
  private _animationCurveOwners: AnimationCurveOwner[][] = [];
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
      console.warn("The animatorController is modified, please call play()/crossFade() method again.");
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

    const animatorInfo = this._getAnimatorStateInfo(stateName, layerIndex, Animator._animatorInfo);
    const { state } = animatorInfo;

    if (!state) {
      return;
    }
    const animatorLayerData = this._getAnimatorLayerData(animatorInfo.layerIndex);
    const { srcPlayData } = animatorLayerData;
    const { state: curState } = srcPlayData;
    if (curState && curState !== state) {
      this._revertDefaultValue(srcPlayData);
    }

    //CM: Not consider same stateName, but different animation
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

    const { state } = this._getAnimatorStateInfo(stateName, layerIndex, Animator._animatorInfo);
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

  private _getAnimatorStateInfo(stateName: string, layerIndex: number, out: AnimatorStateInfo): AnimatorStateInfo {
    let state: AnimatorState = null;
    const { _animatorController: animatorController } = this;
    if (animatorController) {
      const layers = animatorController.layers;
      if (layerIndex === -1) {
        for (let i = 0, n = layers.length; i < n; i--) {
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
      const propertyOwners = animationCureOwners[instanceId] || (animationCureOwners[instanceId] = []);
      curveOwners[i] =
        propertyOwners[property] ||
        (propertyOwners[property] = new AnimationCurveOwner(targetEntity, curve.type, property));
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

    // Standby have two sub state, one is never play, one is finished, never play srcPlayData is null.
    srcPlayData && this._prepareSrcCrossData(crossCurveData, srcPlayData, crossCurveMark, true);
    // Add dest cross curve data.
    this._prepareDestCrossData(crossCurveData, animatorLayerData.destPlayData, crossCurveMark, true);
  }

  private _prepareFixedPoseCrossFading(animatorLayerData: AnimatorLayerData): void {
    const crossCurveData = this._crossCurveDataCollection;

    // Save current cross curve data owner fixed pose.
    for (let i = crossCurveData.length - 1; i >= 0; i--) {
      crossCurveData[i].curveOwner.saveFixedPoseValue();
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
      owner.crossCurveIndex = crossCurveData.length;
      saveFixed && owner.saveFixedPoseValue();
      this._addCrossCurveData(crossCurveData, owner, i, null);
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
      // Not include in previous AnimatorState.
      if (owner.crossCurveMark === crossCurveMark) {
        crossCurveData[owner.crossCurveIndex].destCurveIndex = i;
      } else {
        saveFixed && owner.saveFixedPoseValue();
        owner.crossCurveMark = crossCurveMark;
        this._addCrossCurveData(crossCurveData, owner, null, i);
      }
    }
  }

  private _evaluateCurve(
    property: AnimationProperty,
    curve: AnimationCurve,
    time: number,
    additive: boolean
  ): InterpolableValue {
    const value = curve.evaluate(time);

    if (additive) {
      const baseValue = (<UnionInterpolableKeyframe>curve.keys[0]).value;
      switch (property) {
        case AnimationProperty.Position:
          const pos = Animator._tempVector3;
          Vector3.subtract(<Vector3>value, <Vector3>baseValue, pos);
          return pos;
        case AnimationProperty.Rotation:
          const rot = Animator._tempQuaternion;
          Quaternion.conjugate(<Quaternion>baseValue, rot);
          Quaternion.multiply(rot, <Quaternion>value, <Quaternion>rot);
          return rot;
        case AnimationProperty.Scale:
          const scale = Animator._tempVector3;
          Vector3.divide(<Vector3>value, <Vector3>baseValue, <Vector3>scale);
          return scale;
      }
    }
    return value;
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
    this._checkTransition(srcPlayData, crossFadeTransitionInfo, layerIndex);
    switch (animLayerData.layerState) {
      case LayerState.Playing:
        this._updatePlayingState(srcPlayData, animLayerData, layerWeight, deltaTime, layerAdditive);
        break;
      case LayerState.FixedCrossFading:
        this._updateCrossFadeFromPose(destPlayData, animLayerData, layerWeight, deltaTime, layerAdditive);
        break;
      case LayerState.CrossFading:
        this._updateCrossFade(srcPlayData, destPlayData, animLayerData, layerWeight, deltaTime, layerAdditive);
        break;
    }
  }

  private _updatePlayingState(
    playData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    weight: number,
    delta: number,
    additive: boolean
  ): void {
    const { curveOwners, eventHandlers } = playData.stateData;
    const { state } = playData;
    const { _curveBindings: curves } = state.clip;
    const lastClipTime = playData.clipTime;

    playData.update();

    const clipTime = playData.clipTime;

    eventHandlers.length && this._fireAnimationEvents(playData, eventHandlers, lastClipTime, clipTime);

    for (let i = curves.length - 1; i >= 0; i--) {
      const owner = curveOwners[i];
      const value = this._evaluateCurve(owner.property, curves[i].curve, clipTime, additive);
      if (additive) {
        this._applyClipValueAdditive(owner, value, weight);
      } else {
        this._applyClipValue(owner, value, weight);
      }
    }
    playData.frameTime += state.speed * delta;

    if (playData.finished) {
      layerData.layerState = LayerState.Standby;
    }
  }

  private _updateCrossFade(
    srcPlayData: AnimatorStatePlayData,
    destPlayData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    weight: number,
    delta: number,
    additive: boolean
  ) {
    const crossCurveDataCollection = this._crossCurveDataCollection;
    const srcCurves = srcPlayData.state.clip._curveBindings;
    const { state: destState } = destPlayData;
    const destCurves = destState.clip._curveBindings;

    let crossWeight = destPlayData.frameTime / (destState._getDuration() * layerData.crossFadeTransition.duration);
    crossWeight >= 1.0 && (crossWeight = 1.0);
    srcPlayData.update();
    destPlayData.update();

    const srcClipTime = srcPlayData.clipTime;
    const destClipTime = destPlayData.clipTime;
    for (let i = crossCurveDataCollection.length - 1; i >= 0; i--) {
      const { curveOwner, srcCurveIndex, destCurveIndex } = crossCurveDataCollection[i];
      const { property, defaultValue } = curveOwner;

      const srcCurve = srcCurves[srcCurveIndex].curve;
      const destCurve = destCurves[destCurveIndex].curve;

      const srcValue =
        srcCurveIndex >= 0 ? this._evaluateCurve(property, srcCurve, srcClipTime, additive) : defaultValue;
      const destValue =
        destCurveIndex >= 0 ? this._evaluateCurve(property, destCurve, destClipTime, additive) : defaultValue;

      this._applyCrossClipValue(curveOwner, srcValue, destValue, crossWeight, weight, additive);
    }

    this._updateCrossFadeData(layerData, crossWeight, delta, false);
  }

  private _updateCrossFadeFromPose(
    destPlayData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    weight: number,
    delta: number,
    additive: boolean
  ) {
    const crossCurveDataCollection = this._crossCurveDataCollection;
    const { state: destState } = destPlayData;
    const curves = destState.clip._curveBindings;

    let crossWeight = destPlayData.frameTime / (destState._getDuration() * layerData.crossFadeTransition.duration);
    crossWeight >= 1.0 && (crossWeight = 1.0);
    destPlayData.update();

    const destClipTime = destPlayData.clipTime;

    for (let i = crossCurveDataCollection.length - 1; i >= 0; i--) {
      const { curveOwner, destCurveIndex } = crossCurveDataCollection[i];
      const destCurve = curves[destCurveIndex].curve;
      const destValue =
        destCurveIndex >= 0
          ? this._evaluateCurve(curveOwner.property, destCurve, destClipTime, additive)
          : curveOwner.defaultValue;

      this._applyCrossClipValue(curveOwner, curveOwner.fixedPoseValue, destValue, crossWeight, weight, additive);
    }

    this._updateCrossFadeData(layerData, crossWeight, delta, true);
  }

  private _updateCrossFadeData(layerData: AnimatorLayerData, crossWeight: number, delta: number, fixed: boolean): void {
    const { destPlayData } = layerData;
    destPlayData.frameTime += destPlayData.state.speed * delta;
    if (crossWeight === 1.0) {
      if (destPlayData.finished) {
        layerData.layerState = LayerState.Standby;
      } else {
        layerData.layerState = LayerState.Playing;
      }
      layerData.switchPlayData();
    } else {
      fixed || (layerData.srcPlayData.frameTime += layerData.srcPlayData.state.speed * delta);
    }
  }

  private _applyCrossClipValue(
    owner: AnimationCurveOwner,
    srcValue: InterpolableValue,
    destValue: InterpolableValue,
    crossWeight: number,
    layerWeight: number,
    additive: boolean
  ): void {
    let value: InterpolableValue;
    if (owner.type === Transform) {
      const transform = owner.target.transform;
      switch (owner.property) {
        case AnimationProperty.Position:
          Vector3.lerp(srcValue as Vector3, destValue as Vector3, crossWeight, Animator._tempVector3);
          value = Animator._tempVector3;
          break;
        case AnimationProperty.Rotation:
          Quaternion.slerp(srcValue as Quaternion, destValue as Quaternion, crossWeight, Animator._tempQuaternion);
          value = Animator._tempQuaternion;
          break;
        case AnimationProperty.Scale: {
          const scale = transform.scale;
          Vector3.lerp(srcValue as Vector3, destValue as Vector3, crossWeight, Animator._tempVector3);
          transform.scale = scale;
          value = Animator._tempVector3;
          break;
        }
      }
    }

    if (additive) {
      this._applyClipValueAdditive(owner, value, layerWeight);
    } else {
      this._applyClipValue(owner, value, layerWeight);
    }
  }

  private _applyClipValue(owner: AnimationCurveOwner, value: InterpolableValue, weight: number): void {
    if (owner.type === Transform) {
      const transform = owner.target.transform;
      switch (owner.property) {
        case AnimationProperty.Position:
          if (weight === 1.0) {
            transform.position = <Vector3>value;
          } else {
            const position = transform.position;
            Vector3.lerp(position, <Vector3>value, weight, position);
            transform.position = position;
          }
          break;
        case AnimationProperty.Rotation:
          if (weight === 1.0) {
            transform.rotationQuaternion = <Quaternion>value;
          } else {
            const rotationQuaternion = transform.rotationQuaternion;
            Quaternion.slerp(rotationQuaternion, <Quaternion>value, weight, rotationQuaternion);
            transform.rotationQuaternion = rotationQuaternion;
          }
          break;
        case AnimationProperty.Scale:
          if (weight === 1.0) {
            transform.scale = <Vector3>value;
          } else {
            const scale = transform.scale;
            Vector3.lerp(scale, <Vector3>value, weight, scale);
            transform.scale = scale;
          }
          break;
      }
    } else if (owner.type === SkinnedMeshRenderer) {
      switch (owner.property) {
        case AnimationProperty.BlendShapeWeights:
          (<SkinnedMeshRenderer>owner.component).blendShapeWeights = <Float32Array>value;
          break;
      }
    }
  }

  private _applyClipValueAdditive(owner: AnimationCurveOwner, additiveValue: InterpolableValue, weight: number): void {
    if (owner.type === Transform) {
      const transform = (<Entity>owner.target).transform;
      switch (owner.property) {
        case AnimationProperty.Position:
          const position = transform.position;
          position.x += (<Vector3>additiveValue).x * weight;
          position.y += (<Vector3>additiveValue).y * weight;
          position.z += (<Vector3>additiveValue).z * weight;
          transform.position = position;
          break;
        case AnimationProperty.Rotation:
          const rotationQuaternion = transform.rotationQuaternion;
          AnimatorUtils.quaternionWeight(<Quaternion>additiveValue, weight, <Quaternion>additiveValue);
          (<Quaternion>additiveValue).normalize();
          rotationQuaternion.multiply(<Quaternion>additiveValue);
          transform.rotationQuaternion = rotationQuaternion;
          break;
        case AnimationProperty.Scale:
          const scale = transform.scale;
          AnimatorUtils.scaleWeight(scale, weight, scale);
          Vector3.multiply(scale, <Vector3>additiveValue, scale);
          transform.scale = scale;
          break;
      }
    }
  }

  private _revertDefaultValue(playData: AnimatorStatePlayData) {
    const { clip } = playData.state;
    if (clip) {
      const curves = clip._curveBindings;
      const { curveOwners } = playData.stateData;
      for (let i = curves.length - 1; i >= 0; i--) {
        const owner = curveOwners[i];
        const { transform } = owner.target;
        switch (owner.property) {
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
      if (duration * transition.exitTime >= clipTime) {
        crossFadeTransition !== transition && this._crossFadeByTransition(transition, layerIndex);
      }
    }
  }

  private _crossFadeByTransition(transition: AnimatorStateTransition, layerIndex: number) {
    const { name } = transition.destinationState;
    const animatorStateInfo = this._getAnimatorStateInfo(name, layerIndex, Animator._animatorInfo);
    const { state: crossState } = animatorStateInfo;
    if (!crossState) {
      return;
    }

    const animatorLayerData = this._getAnimatorLayerData(animatorStateInfo.layerIndex);
    const layerState = animatorLayerData.layerState;
    const { destPlayData } = animatorLayerData;

    const animatorStateData = this._getAnimatorStateData(name, crossState, animatorLayerData);
    const duration = crossState._getDuration();
    const offset = duration * transition.offset;
    destPlayData.reset(crossState, animatorStateData, offset);

    this._saveDefaultValues(animatorStateData);

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
    // TODO: If play backward, not work.
    if (clipTime < lastClipTime) {
      this._fireSubAnimationEvents(playState, eventHandlers, lastClipTime, playState.state.clipEndTime);
      playState.currentEventIndex = 0;
      this._fireSubAnimationEvents(playState, eventHandlers, playState.state.clipStartTime, clipTime);
    } else {
      this._fireSubAnimationEvents(playState, eventHandlers, lastClipTime, clipTime);
    }
  }

  private _fireSubAnimationEvents(
    playState: AnimatorStatePlayData,
    eventHandlers: AnimationEventHandler[],
    lastClipTime: number,
    curClipTime: number
  ): void {
    for (let i = playState.currentEventIndex, n = eventHandlers.length; i < n; i++) {
      const eventHandler = eventHandlers[i];
      const { time, parameter } = eventHandler.event;

      if (time > curClipTime) {
        break;
      }

      const { handlers } = eventHandler;
      if (time >= lastClipTime) {
        for (let j = handlers.length - 1; j >= 0; j--) {
          handlers[j](parameter);
        }
        playState.currentEventIndex = i + 1;
      }
    }
  }

  private _clearPlayData() {
    this._animatorLayersData.length = 0;
    this._crossCurveDataCollection.length = 0;
    this._animationCurveOwners.length = 0;
    this._controllerUpdateFlag.flag = false;
  }
}
