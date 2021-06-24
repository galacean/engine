import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { ClassPool } from "../RenderPipeline/ClassPool";
import { Transform } from "../Transform";
import { AnimationCurve } from "./AnimationCurve";
import { AnimatorController } from "./AnimatorController";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { AnimatorState } from "./AnimatorState";
import { AnimatorStateTransition } from "./AnimatorTransition";
import { AnimatorUtils } from "./AnimatorUtils";
import { AnimationProperty } from "./enums/AnimationProperty";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { LayerState } from "./enums/LayerState";
import { AnimationCureOwner } from "./internal/AnimationCureOwner";
import { AnimatorLayerData } from "./internal/AnimatorLayerData";
import { AnimatorStateData } from "./internal/AnimatorStataData";
import { AnimatorStateInfo } from "./internal/AnimatorStateInfo";
import { AnimatorStatePlayData } from "./internal/AnimatorStatePlayData";
import { CrossCurveData } from "./internal/CrossCurveData";
import { InterpolableValue } from "./KeyFrame";

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
  private _tempVector3: Vector3 = new Vector3();
  @ignoreClone
  private _tempQuaternion: Quaternion = new Quaternion();
  @ignoreClone
  private _animatorLayersData: AnimatorLayerData[] = [];
  @ignoreClone
  private _crossCurveDataCollection: CrossCurveData[] = [];
  @ignoreClone
  private _crossFadeTransition: AnimatorStateTransition = new AnimatorStateTransition();
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
    //CM: 播放完成目标动作后是否允许其值呗修改（建议允许，动作结束以及没播放前均允许修改）
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
    const { owners } = stateData;
    for (let i = owners.length - 1; i >= 0; i--) {
      owners[i].saveDefaultValue();
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
    }
    return animatorStateData;
  }

  private _saveAnimatorStateData(animatorState: AnimatorState, animatorStateData: AnimatorStateData): void {
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
    this._crossCurveDataCollection.length = 0;
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
      const dataItem = crossCurveData[i];
      dataItem.owner.saveFixedPoseValue();
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
    destPlayData: AnimatorStatePlayData,
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
    value: InterpolableValue,
    weight: number
  ): void {
    const transform = target.transform;
    if (type === Transform) {
      switch (property) {
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

  private _applyClipValueAddtive(
    target: Entity,
    type: new (entity: Entity) => Component,
    property: AnimationProperty,
    addtiveValue: InterpolableValue,
    weight: number
  ): void {
    const transform = (<Entity>target).transform;
    if (type === Transform) {
      switch (property) {
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

  private _updateLayer(layerIndex: number, firstLayer: boolean, deltaTime: number): void {
    const { blendingMode, weight } = this.layers[layerIndex];
    const animlayerData = this._animatorLayersData[layerIndex];
    const { srcPlayData, destPlayData, layerState } = animlayerData;

    const layerAddtive = blendingMode === AnimatorLayerBlendingMode.Additive;
    const layerWeight = firstLayer ? 1.0 : weight;
    switch (layerState) {
      case LayerState.Playing:
        this._updatePlayingState(srcPlayData, layerWeight, deltaTime, layerAddtive);
        break;
      case LayerState.FixedCrossFading:
        this._updateCrossFadeFromPose(destPlayData, animlayerData, layerWeight, deltaTime, layerAddtive), layerAddtive;
        break;
      case LayerState.CrossFading:
        this._updateCrossFade(srcPlayData, destPlayData, animlayerData, layerWeight, deltaTime, layerAddtive);
        break;
    }
  }

  private _updatePlayingState(playData: AnimatorStatePlayData, weight: number, delta: number, addtive: boolean) {
    const { state } = playData;
    const { owners } = playData.stateData;
    const { _curves: curves } = state.clip;
    const frameTime = state._getClipRealTime(playData.frameTime);
    for (let i = curves.length - 1; i >= 0; i--) {
      const { target, type, property } = owners[i];
      const { curve } = curves[i];
      const value = this._evaluateCurve(property, curve, frameTime, addtive);
      if (addtive) {
        this._applyClipValueAddtive(target, type, property, value, weight);
      } else {
        this._applyClipValue(target, type, property, value, weight);
      }
    }
    playData.frameTime += delta;
  }

  private _updateCrossFade(
    srcStateData: AnimatorStatePlayData,
    destStateData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    weight: number,
    delta: number,
    addtive: boolean
  ) {
    const transition = this._crossFadeTransition;
    const srcState = srcStateData.state;
    const destState = destStateData.state;
    const srcClip = srcState.clip;
    const destClip = destState.clip;

    let crossWeight = destStateData.frameTime / transition.duration;
    crossWeight >= 1.0 && (crossWeight = 1.0);

    const crossCurveDataCollection = this._crossCurveDataCollection;
    const srcCurves = srcClip._curves;
    const destCurves = destClip._curves;
    const srcClipTime = srcState._getClipRealTime(srcStateData.frameTime);
    const destClipTime = destState._getClipRealTime(destStateData.frameTime);

    for (let i = crossCurveDataCollection.length - 1; i >= 0; i--) {
      const { owner, curCurveIndex, nextCurveIndex } = crossCurveDataCollection[i];
      const { type, property, target, defaultValue } = owner;

      const srcValue =
        curCurveIndex >= 0
          ? this._evaluateCurve(property, srcCurves[curCurveIndex].curve, srcClipTime, addtive)
          : defaultValue;

      const destValue =
        nextCurveIndex >= 0
          ? this._evaluateCurve(property, destCurves[nextCurveIndex].curve, destClipTime, addtive)
          : defaultValue;

      const value = this._getCrossFadeValue(target, type, property, srcValue, destValue, crossWeight);
      if (addtive) {
        this._applyClipValueAddtive(target, type, property, value, weight);
      } else {
        this._applyClipValue(target, type, property, value, weight);
      }
    }

    destStateData.frameTime += delta;
    if (crossWeight === 1.0) {
      layerData.layerState = LayerState.Playing;
      layerData.switcPlayData();
    } else {
      srcStateData.frameTime += delta;
    }
  }

  private;

  private _updateCrossFadeFromPose(
    destStateData: AnimatorStatePlayData,
    layerData: AnimatorLayerData,
    weight: number,
    delta: number,
    addtive: boolean
  ) {
    const transition = this._crossFadeTransition;
    const destState = destStateData.state;
    const destClip = destState.clip;

    let crossWeight = destStateData.frameTime / transition.duration;
    crossWeight >= 1.0 && (crossWeight = 1.0);

    const crossCurveDataCollection = this._crossCurveDataCollection;
    const curves = destClip._curves;
    const destClipTime = destState._getClipRealTime(destStateData.frameTime);

    for (let i = crossCurveDataCollection.length - 1; i >= 0; i--) {
      const { owner, nextCurveIndex } = crossCurveDataCollection[i];
      const { target, type, property, fixedPoseValue, defaultValue } = owner;

      const destValue =
        nextCurveIndex >= 0
          ? this._evaluateCurve(property, curves[nextCurveIndex].curve, destClipTime, addtive)
          : defaultValue;

      const value = this._getCrossFadeValue(target, type, property, fixedPoseValue, destValue, crossWeight);
      if (addtive) {
        this._applyClipValueAddtive(target, type, property, value, weight);
      } else {
        this._applyClipValue(target, type, property, value, weight);
      }
    }

    destStateData.frameTime += delta;
    if (crossWeight === 1.0) {
      layerData.layerState = LayerState.Playing;
      layerData.switcPlayData();
    }
  }

  private _revertDefaultValue(playData: AnimatorStatePlayData) {
    const { clip } = playData.state;
    if (clip) {
      const curves = clip._curves;
      const { owners } = playData.stateData;
      for (let i = curves.length - 1; i >= 0; i--) {
        const owner = owners[i];
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
}
