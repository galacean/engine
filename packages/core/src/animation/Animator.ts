import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { ClassPool } from "../RenderPipeline/ClassPool";
import { Transform } from "../Transform";
import { AnimationCurve } from "./AnimationCurve";
import { AnimatorController } from "./AnimatorController";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { AnimatorUtils } from "./AnimatorUtils";
import { AnimationProperty } from "./enums/AnimationProperty";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { LayerState } from "./enums/LayerState";
import { AnimationCurveOwner } from "./internal/AnimationCurveOwner";
import { AnimatorLayerData } from "./internal/AnimatorLayerData";
import { AnimatorStateData } from "./internal/AnimatorStataData";
import { AnimatorStateInfo } from "./internal/AnimatorStateInfo";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";
import { CrossCurveData } from "./internal/CrossCurveData";
import { InterpolableValue } from "./KeyFrame";
import { MathUtil } from "../../../math/src/MathUtil";
import { AnimationEventHandler } from "./internal/AnimationEventHandler";
import { Script } from "../Script";

/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  private static _tempVector3: Vector3 = new Vector3();
  private static _tempQuaternion: Quaternion = new Quaternion();
  private static _animatorInfo: AnimatorStateInfo = new AnimatorStateInfo();

  /** The playback speed of the Animator, 1.0 is normal playback speed. */
  speed: number = 1.0;
  /** All layers from the AnimatorController which belongs this Animator .*/
  animatorController: AnimatorController;

  @ignoreClone
  private _animatorLayersData: AnimatorLayerData[] = [];
  @ignoreClone
  private _crossCurveDataCollection: CrossCurveData[] = [];
  @ignoreClone
  private _crossFadeTransition: AnimatorStateTransition = new AnimatorStateTransition();
  @ignoreClone
  private _animationCurveOwners: AnimationCurveOwner[][] = [];
  @ignoreClone
  private _crossCurveDataPool: ClassPool<CrossCurveData> = new ClassPool(CrossCurveData);
  @ignoreClone
  private _entityScripts: Script[] = [];

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
    srcPlayData.state = state;
    srcPlayData.frameTime = state._getDuration() * normalizedTimeOffset;
    srcPlayData.stateData = animatorStateData;
    srcPlayData.finished = false;

    this._saveDefaultValues(animatorStateData);
  }

  /**
   * Create a crossfade from the current state to another state.
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
    const animatorInfo = this._getAnimatorStateInfo(stateName, layerIndex, Animator._animatorInfo);
    const { state: crossState } = animatorInfo;
    if (!crossState) {
      return;
    }

    const animatorLayerData = this._getAnimatorLayerData(animatorInfo.layerIndex);
    const layerState = animatorLayerData.layerState;
    const { destPlayData } = animatorLayerData;

    const animatorStateData = this._getAnimatorStateData(stateName, crossState, animatorLayerData);
    const duration = crossState._getDuration();
    const offset = duration * normalizedTimeOffset;
    destPlayData.state = crossState;
    destPlayData.frameTime = offset;
    destPlayData.stateData = animatorStateData;
    destPlayData.finished = false;

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
        this._prepareFiexdPoseCrossFading(animatorLayerData);
        break;
      case LayerState.FixedCrossFading:
        this._prepareFiexdPoseCrossFading(animatorLayerData);
        break;
    }

    const transition = this._crossFadeTransition;
    transition.offset = offset;
    transition.duration = duration * normalizedTransitionDuration;
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
    const { animatorController } = this;
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
    const { _curves: curves } = animatorState.clip;
    for (let i = curves.length - 1; i >= 0; i--) {
      const curve = curves[i];
      const targetEntity = entity.findByPath(curve.relativePath);
      const { property } = curve;
      const { instanceId } = targetEntity;
      const propertyOwners = animationCureOwners[instanceId] || (animationCureOwners[instanceId] = []);
      curveOwners[i] =
        propertyOwners[property] ||
        (propertyOwners[property] = new AnimationCurveOwner(targetEntity, curve.type, property));
    }
  }

  private _saveAnimatorEventHandlers(state: AnimatorState, animatorStateData: AnimatorStateData) {
    const { _entityScripts: scripts } = this;
    const { events } = state.clip;
    const { eventHandlers } = animatorStateData;
    scripts.length = 0;
    eventHandlers.length = 0;
    this._entity.getComponents(Script, scripts);
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      const funcName = event.functionName;
      for (let j = scripts.length - 1; j >= 0; j--) {
        const handler = scripts[j][funcName];
        if (handler) {
          const eventHandler = new AnimationEventHandler();
          eventHandler.event = event;
          eventHandler.handlers.push(handler);
          eventHandlers.push(eventHandler);
        }
      }
    }
    eventHandlers.sort((a, b) => b.event.time - a.event.time);
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

    // Standby have two sub state, one is never play, one is finshed, never play srcPlayData is null.
    srcPlayData && this._prepareSrcCrossData(crossCurveData, srcPlayData, crossCurveMark, true);
    // Add dest cross curve data.
    this._prepareDestCrossData(crossCurveData, animatorLayerData.destPlayData, crossCurveMark, true);
  }

  private _prepareFiexdPoseCrossFading(animatorLayerData: AnimatorLayerData): void {
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
      // Not inclue in previous AnimatorState.
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
    addtive: boolean
  ): InterpolableValue {
    const value = curve.evaluate(time);

    if (addtive) {
      const baseValue = curve.keys[0].value;
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
    const { blendingMode, weight } = this.animatorController.layers[layerIndex];
    const animlayerData = this._animatorLayersData[layerIndex];
    const { srcPlayData, destPlayData } = animlayerData;

    const layerAddtive = blendingMode === AnimatorLayerBlendingMode.Additive;
    const layerWeight = firstLayer ? 1.0 : weight;
    switch (animlayerData.layerState) {
      case LayerState.Playing:
        this._updatePlayingState(srcPlayData, animlayerData, layerWeight, deltaTime, layerAddtive);
        break;
      case LayerState.FixedCrossFading:
        this._updateCrossFadeFromPose(destPlayData, animlayerData, layerWeight, deltaTime, layerAddtive), layerAddtive;
        break;
      case LayerState.CrossFading:
        this._updateCrossFade(srcPlayData, destPlayData, animlayerData, layerWeight, deltaTime, layerAddtive);
        break;
    }
  }

  private _updatePlayingState(
    playData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    weight: number,
    delta: number,
    addtive: boolean
  ): void {
    const { curveOwners, eventHandlers } = playData.stateData;
    const { _curves: curves } = playData.state.clip;
    const lastClipTime = playData.clipTime;

    playData.update();

    const clipTime = playData.clipTime;

    this._fireAnimationEvents(eventHandlers, lastClipTime, clipTime);

    for (let i = curves.length - 1; i >= 0; i--) {
      const owner = curveOwners[i];
      const value = this._evaluateCurve(owner.property, curves[i].curve, clipTime, addtive);
      if (addtive) {
        this._applyClipValueAddtive(owner, value, weight);
      } else {
        this._applyClipValue(owner, value, weight);
      }
    }
    playData.frameTime += delta;

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
    addtive: boolean
  ) {
    const crossCurveDataCollection = this._crossCurveDataCollection;
    const srcCurves = srcPlayData.state.clip._curves;
    const destCurves = destPlayData.state.clip._curves;

    let crossWeight = destPlayData.frameTime / this._crossFadeTransition.duration;
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
        srcCurveIndex >= 0 ? this._evaluateCurve(property, srcCurve, srcClipTime, addtive) : defaultValue;
      const destValue =
        destCurveIndex >= 0 ? this._evaluateCurve(property, destCurve, destClipTime, addtive) : defaultValue;

      this._applyCrossClipValue(curveOwner, srcValue, destValue, crossWeight, weight, addtive);
    }

    this._updateCrossFadeData(layerData, crossWeight, delta, false);
  }

  private _updateCrossFadeFromPose(
    destPlayData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    weight: number,
    delta: number,
    addtive: boolean
  ) {
    const crossCurveDataCollection = this._crossCurveDataCollection;
    const curves = destPlayData.state.clip._curves;

    let crossWeight = destPlayData.frameTime / this._crossFadeTransition.duration;
    crossWeight >= 1.0 && (crossWeight = 1.0);
    destPlayData.update();

    const destClipTime = destPlayData.clipTime;

    for (let i = crossCurveDataCollection.length - 1; i >= 0; i--) {
      const { curveOwner, destCurveIndex } = crossCurveDataCollection[i];
      const destCurve = curves[destCurveIndex].curve;
      const destValue =
        destCurveIndex >= 0
          ? this._evaluateCurve(curveOwner.property, destCurve, destClipTime, addtive)
          : curveOwner.defaultValue;

      this._applyCrossClipValue(curveOwner, curveOwner.fixedPoseValue, destValue, crossWeight, weight, addtive);
    }

    this._updateCrossFadeData(layerData, crossWeight, delta, true);
  }

  private _updateCrossFadeData(layerData: AnimatorLayerData, crossWeight: number, delta: number, fixed: boolean): void {
    layerData.destPlayData.frameTime += delta;
    if (crossWeight === 1.0) {
      if (layerData.destPlayData.finished) {
        layerData.layerState = LayerState.Standby;
      } else {
        layerData.layerState = LayerState.Playing;
      }
      layerData.switchPlayData();
    } else {
      fixed || (layerData.srcPlayData.frameTime += delta);
    }
  }

  private _applyCrossClipValue(
    owner: AnimationCurveOwner,
    srcValue: InterpolableValue,
    destValue: InterpolableValue,
    crossWeight: number,
    layerWeight: number,
    addtive: boolean
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

    if (addtive) {
      this._applyClipValueAddtive(owner, value, layerWeight);
    } else {
      this._applyClipValue(owner, value, layerWeight);
    }
  }

  private _applyClipValue(owener: AnimationCurveOwner, value: InterpolableValue, weight: number): void {
    if (owener.type === Transform) {
      const transform = owener.target.transform;
      switch (owener.property) {
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
    }
  }

  private _applyClipValueAddtive(owner: AnimationCurveOwner, addtiveValue: InterpolableValue, weight: number): void {
    if (owner.type === Transform) {
      const transform = (<Entity>owner.target).transform;
      switch (owner.property) {
        case AnimationProperty.Position:
          const position = transform.position;
          position.x += (<Vector3>addtiveValue).x * weight;
          position.y += (<Vector3>addtiveValue).y * weight;
          position.z += (<Vector3>addtiveValue).z * weight;
          transform.position = position;
          break;
        case AnimationProperty.Rotation:
          const rotationQuaternion = transform.rotationQuaternion;
          AnimatorUtils.quaternionWeight(<Quaternion>addtiveValue, weight, <Quaternion>addtiveValue);
          (<Quaternion>addtiveValue).normalize();
          rotationQuaternion.multiply(<Quaternion>addtiveValue);
          transform.rotationQuaternion = rotationQuaternion;
          break;
        case AnimationProperty.Scale:
          const scale = transform.scale;
          AnimatorUtils.scaleWeight(scale, weight, scale);
          Vector3.multiply(scale, <Vector3>addtiveValue, scale);
          transform.scale = scale;
          break;
      }
    }
  }

  private _revertDefaultValue(playData: AnimatorStatePlayData) {
    const { clip } = playData.state;
    if (clip) {
      const curves = clip._curves;
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

  private _fireAnimationEvents(eventHandlers: AnimationEventHandler[], lastClipTime: number, clipTime: number) {
    for (let i = eventHandlers.length - 1; i >= 0; i--) {
      const eventHandler = eventHandlers[i];
      const { time, parameter } = eventHandler.event;

      if (time > clipTime) break;
      if (time < lastClipTime) continue;

      const { handlers } = eventHandler;
      if (time === MathUtil.clamp(time, lastClipTime, clipTime)) {
        for (let j = handlers.length - 1; j >= 0; j--) {
          handlers[j](parameter);
        }
      }
    }
  }
}
