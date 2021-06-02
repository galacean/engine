import { WrapMode } from "./enums/WrapMode";
import { Transform } from "./../Transform";
import { AnimatorState } from "./AnimatorState";
import { InterpolableValueType } from "./enums/InterpolableValueType";
import { InterpolableValue } from "./KeyFrame";
import { AnimatorControllerLayer } from "./AnimatorControllerLayer";
import { AnimatorController } from "./AnimatorController";
import { Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { AnimatorUtils } from "./AnimatorUtils";
import { AnimatorLayerBlendingMode } from "./enums/AnimatorLayerBlendingMode";
import { PlayType } from "./enums/PlayType";
import { ignoreClone } from "../clone/CloneManager";
import { AnimationProperty } from "./enums/AnimationProperty";

/**
 * @internal
 */
interface CurveData {
  target: Entity;
  defaultValue: InterpolableValue;
}

/**
 * @internal
 */
interface AnimatorStateData {
  state: AnimatorState;
  frameTime: number;
  playType: PlayType;
  curveDatas: CurveData[];
}

/**
 * @internal
 */
interface AnimatorLayerData {
  playingStateData: AnimatorStateData | null;
  fadingStateData: AnimatorStateData | null;
}
/**
 * The controller of the animation system.
 */
export class Animator extends Component {
  /** The playback speed of the Animator, 1.0 is normal playback speed. */
  speed: number = 1.0;
  animatorController: AnimatorController;

  @ignoreClone
  private _diffValueFromBasePos: InterpolableValue;
  @ignoreClone
  private _diffFloatFromBasePos: number = 0;
  @ignoreClone
  private _diffVector2FromBasePos: Vector2 = new Vector2();
  @ignoreClone
  private _diffVector3FromBasePos: Vector3 = new Vector3();
  @ignoreClone
  private _diffVector4FromBasePos: Vector4 = new Vector4();
  @ignoreClone
  private _diffQuaternionFromBasePos: Quaternion = new Quaternion();
  @ignoreClone
  private _tempVector3: Vector3 = new Vector3();
  @ignoreClone
  private _tempQuaternion: Quaternion = new Quaternion();
  @ignoreClone
  private _animatorLayersData: AnimatorLayerData[] = [];

  playing: boolean;

  /**
   * Get all layers from the AnimatorController which belongs this Animator .
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
   * Plays a state by name.
   * @param stateName - The state name
   * @param layerIndex - The layer index(default 0)
   * @param normalizedTimeOffset - The time offset between 0 and 1(default 0)
   */
  play(stateName: string, layerIndex: number = 0, normalizedTimeOffset: number = 0): AnimatorState {
    const { animatorController } = this;
    if (!animatorController) return;
    const animLayer = animatorController.layers[layerIndex];
    const theState = animLayer.stateMachine.findStateByName(stateName);
    this._animatorLayersData[layerIndex] = this._animatorLayersData[layerIndex] || {
      playingStateData: {
        state: theState,
        frameTime: theState.clip.length * normalizedTimeOffset,
        playType: PlayType.NotStart,
        curveDatas: []
      },
      fadingStateData: null
    };
    this._setDefaultValueAndTarget(this._animatorLayersData[layerIndex].playingStateData);
    this.playing = true;
    return theState;
  }

  /**
   * crossFade to the AnimationClip by name.
   * @param name - The name of the next state
   * @param layerIndex - The layer where the crossfade occurs
   * @param normalizedTransitionDuration - The duration of the transition (normalized)
   * @param normalizedTimeOffset - The time of the next state (normalized)
   */
  crossFade(
    name: string,
    layerIndex: number,
    normalizedTransitionDuration: number,
    normalizedTimeOffset: number
  ): void {
    const animLayer = this.animatorController.layers[layerIndex];
    const { playingStateData } = this._animatorLayersData[layerIndex];
    if (playingStateData) {
      playingStateData.playType = PlayType.IsFading;
      const nextState = animLayer.stateMachine.findStateByName(name);
      if (nextState) {
        const transition = playingStateData.state.addTransition(nextState);
        this._animatorLayersData[layerIndex].fadingStateData = {
          state: nextState,
          frameTime: 0,
          playType: PlayType.NotStart,
          curveDatas: []
        };
        this._setDefaultValueAndTarget(this._animatorLayersData[layerIndex].fadingStateData);
        transition.duration = playingStateData.state.clip.length * normalizedTransitionDuration;
        transition.offset = nextState.clip.length * normalizedTimeOffset;
        transition.exitTime = playingStateData.frameTime;
      }
    }
  }

  /**
   * Evaluates the animator component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update
   */
  update(deltaTime: number): void {
    if (this.speed === 0) return;
    if (!this.playing) return;
    deltaTime *= this.speed;
    const { animatorController } = this;
    if (!animatorController) return;
    const { layers } = animatorController;
    for (let i = 0; i < layers.length; i++) {
      const isFirstLayer = i === 0;
      if (this._animatorLayersData[i]) {
        const playingStateData = this._animatorLayersData[i].playingStateData;
        playingStateData.frameTime += deltaTime / 1000;
        if (playingStateData.playType === PlayType.IsFading) {
          const fadingStateData = this._animatorLayersData[i].fadingStateData;
          if (fadingStateData) {
            fadingStateData.frameTime += deltaTime / 1000;
            if (fadingStateData.frameTime > fadingStateData.state.clipEndTime) {
              fadingStateData.frameTime = fadingStateData.state.clipEndTime;
            }
          }
        }
        if (playingStateData.playType === PlayType.IsPlaying) {
          if (playingStateData.frameTime > playingStateData.state.clipEndTime) {
            if (playingStateData.state.wrapMode === WrapMode.Loop) {
              playingStateData.frameTime = playingStateData.frameTime % playingStateData.state.clipEndTime;
            } else {
              playingStateData.frameTime = playingStateData.state.clipEndTime;
            }
          }
        }
        this._updatePlayingState(i, isFirstLayer, deltaTime);
      }
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
  _setDefaultValueAndTarget(stateData: AnimatorStateData): void {
    const { clip } = stateData.state;
    if (clip) {
      const curves = clip._curves;
      const { length: curvesCount } = curves;
      for (let i = curvesCount - 1; i >= 0; i--) {
        const curve = curves[i];
        const { relativePath, property } = curve;
        const targetEntity = this.entity.findByName(relativePath);
        let defaultValue: InterpolableValue;
        switch (property) {
          case AnimationProperty.Position:
            defaultValue = targetEntity.position;
            break;
          case AnimationProperty.Rotation:
            defaultValue = targetEntity.rotation;
            break;
          case AnimationProperty.Scale:
            defaultValue = targetEntity.scale;
            break;
        }
        stateData.curveDatas[i] = {
          target: targetEntity,
          defaultValue
        };
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

  private _calculateFloatDiff(property: AnimationProperty, sVal: number, dVal: number): void {
    if (property === AnimationProperty.Scale) {
      this._diffFloatFromBasePos = dVal / sVal;
    } else {
      this._diffFloatFromBasePos = dVal - sVal;
    }
    this._diffValueFromBasePos = this._diffFloatFromBasePos;
  }

  private _calculateVector2Diff(property: AnimationProperty, sVal: Vector2, dVal: Vector2): void {
    if (property === AnimationProperty.Scale) {
      this._diffVector2FromBasePos.x = dVal.x / sVal.x;
      this._diffVector2FromBasePos.y = dVal.y / sVal.y;
    } else {
      this._diffVector2FromBasePos.x = dVal.x - sVal.x;
      this._diffVector2FromBasePos.y = dVal.y - sVal.y;
    }
    this._diffValueFromBasePos = this._diffVector2FromBasePos;
  }

  private _calculateVector3Diff(property: AnimationProperty, sVal: Vector3, dVal: Vector3): void {
    if (property === AnimationProperty.Scale) {
      this._diffVector3FromBasePos.x = dVal.x / sVal.x;
      this._diffVector3FromBasePos.y = dVal.y / sVal.y;
      this._diffVector3FromBasePos.z = dVal.z / sVal.z;
    } else {
      this._diffVector3FromBasePos.x = dVal.x - sVal.x;
      this._diffVector3FromBasePos.y = dVal.y - sVal.y;
      this._diffVector3FromBasePos.z = dVal.z - sVal.z;
    }
    this._diffValueFromBasePos = this._diffVector3FromBasePos;
  }

  private _calculateVector4Diff(property: AnimationProperty, sVal: Vector4, dVal: Vector4): void {
    if (property === AnimationProperty.Scale) {
      this._diffVector4FromBasePos.x = dVal.x / sVal.x;
      this._diffVector4FromBasePos.y = dVal.y / sVal.y;
      this._diffVector4FromBasePos.z = dVal.z / sVal.z;
      this._diffVector4FromBasePos.w = dVal.w / sVal.w;
    } else {
      this._diffVector4FromBasePos.x = dVal.x - sVal.x;
      this._diffVector4FromBasePos.y = dVal.y - sVal.y;
      this._diffVector4FromBasePos.z = dVal.z - sVal.z;
      this._diffVector4FromBasePos.w = dVal.w - sVal.w;
    }
    this._diffValueFromBasePos = this._diffVector4FromBasePos;
  }

  private _calculateQuaternionDiff(dVal: Quaternion, sVal: Quaternion): void {
    Quaternion.conjugate(sVal, this._diffQuaternionFromBasePos);
    Quaternion.multiply(this._diffQuaternionFromBasePos, dVal, this._diffQuaternionFromBasePos);
    this._diffValueFromBasePos = this._diffQuaternionFromBasePos;
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

  private _updateLayerValue(
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

  private _updatePlayingState(layerIndex: number, isFirstLayer: boolean, deltaTime: number): void {
    const animLayer = this.layers[layerIndex];
    const animlayerData = this._animatorLayersData[layerIndex];
    const { playingStateData, fadingStateData } = animlayerData;
    const { weight, blendingMode } = animLayer;
    if (playingStateData.playType === PlayType.IsFading) {
      const transition = playingStateData.state.transitions[0];
      const destinationState = transition.destinationState;
      if (transition) {
        let clip = playingStateData.state.clip;
        transition._crossFadeFrameTime += deltaTime / 1000;
        let crossWeight: number;
        if (transition.duration > clip.length - transition.exitTime) {
          crossWeight = transition._crossFadeFrameTime / (clip.length - transition.exitTime);
        } else {
          crossWeight = transition._crossFadeFrameTime / transition.duration;
        }
        if (crossWeight >= 1) {
          crossWeight = 1;
          playingStateData.playType = PlayType.IsFinish;
        }
        let count = clip._curves.length;
        const relativePathList: string[] = [];
        const typeList: (new (entity: Entity) => Component)[] = [];
        const propertyList: AnimationProperty[] = [];
        const relativePathPropertMap: { [key: string]: number } = {};
        const targetPropertyValues = [];
        const targetList = [];
        const defaultValueList = [];
        for (let i = count - 1; i >= 0; i--) {
          const { curve, type, property, relativePath } = clip._curves[i];
          if (!relativePathPropertMap[`${relativePath}_${property}`]) {
            const frameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
            relativePathPropertMap[`${relativePath}_${property}`] = relativePathList.length;
            relativePathList.push(relativePath);
            typeList.push(type);
            propertyList.push(property);
            const val = curve.evaluate(frameTime);
            targetPropertyValues.push([val]);
            targetList.push([playingStateData.curveDatas[i].target]);
            defaultValueList.push([playingStateData.curveDatas[i].defaultValue]);
          }
        }
        clip = destinationState.clip;
        count = clip._curves.length;
        for (let i = count - 1; i >= 0; i--) {
          const { curve, type, property, relativePath } = clip._curves[i];
          if (relativePathPropertMap[`${relativePath}_${property}`] >= 0) {
            const index = relativePathPropertMap[`${relativePath}_${property}`];
            const val = curve.evaluate(transition.offset + transition._crossFadeFrameTime);
            targetPropertyValues[index][1] = val;
          } else {
            relativePathPropertMap[`${relativePath}_${property}`] = relativePathList.length;
            relativePathList.push(relativePath);
            typeList.push(type);
            propertyList.push(property);
            const val = curve.evaluate(transition.offset + transition._crossFadeFrameTime);
            targetPropertyValues.push([null, val]);
            targetList.push([null, fadingStateData.curveDatas[i].target]);
            defaultValueList.push([null, fadingStateData.curveDatas[i].defaultValue]);
          }
        }
        count = relativePathList.length;
        for (let i = count - 1; i >= 0; i--) {
          const relativePath = relativePathList[i];
          const property = propertyList[i];
          const index = relativePathPropertMap[`${relativePath}_${property}`];
          const vals = targetPropertyValues[index];
          const targets = targetList[index];
          const defaultValues = defaultValueList[index];
          const type = typeList[index];

          let calculatedValue: InterpolableValue;
          if (vals[0] && vals[1]) {
            calculatedValue = this._getCrossFadeValue(targets[0], type, property, vals[0], vals[1], crossWeight);
            this._updateLayerValue(targets[0], type, property, defaultValues[0], calculatedValue, weight);
          } else if (vals[0]) {
            calculatedValue = this._getCrossFadeValue(
              targets[0],
              type,
              property,
              defaultValues[0],
              vals[0],
              1 - crossWeight
            );
            this._updateLayerValue(targets[0], type, property, defaultValues[0], calculatedValue, weight);
          } else {
            calculatedValue = this._getCrossFadeValue(
              targets[1],
              type,
              property,
              defaultValues[1],
              vals[1],
              crossWeight
            );
            this._updateLayerValue(targets[1], type, property, defaultValues[1], calculatedValue, weight);
          }
        }
        if (playingStateData.playType === PlayType.IsFinish) {
          this._animatorLayersData[layerIndex].playingStateData = this._animatorLayersData[layerIndex].fadingStateData;
          this._animatorLayersData[layerIndex].fadingStateData = null;
        }
      }
    } else {
      playingStateData.playType = PlayType.IsPlaying;
      const clip = playingStateData.state.clip;
      const count = clip._curves.length;
      for (let i = count - 1; i >= 0; i--) {
        const { curve, type, property } = clip._curves[i];
        const frameTime = playingStateData.state._getTheRealFrameTime(playingStateData.frameTime);
        const val = curve.evaluate(frameTime);
        const { _valueType, _firstFrameValue } = curve;
        const { target } = playingStateData.curveDatas[i];
        const { defaultValue } = playingStateData.curveDatas[i];
        if (isFirstLayer) {
          this._updateLayerValue(target, type, property, defaultValue, val, 1.0);
        } else {
          if (blendingMode === AnimatorLayerBlendingMode.Additive) {
            this._calculateDiff(_valueType, property, _firstFrameValue, val);
            this._updateAdditiveLayerValue(target, type, property, this._diffValueFromBasePos, weight);
          } else {
            this._updateLayerValue(target, type, property, defaultValue, val, weight);
          }
        }
      }
    }
  }
}
