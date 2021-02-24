import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { ignoreClone, shallowClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { SkinnedMeshRenderer } from "../mesh/SkinnedMeshRenderer";
import { AnimationClip, TagetType } from "./AnimationClip";
import { AnimationLayer } from "./AnimationLayer";
import { AnimationOptions, IChannelTarget } from "./types";
/**
 * Animation Component, the AnimationClip player with crossFade and mix abilities.
 */
export class Animation extends Component {
  /**
   * The timeScale getter, timeScale which used for scale the animation time to speed up or slow down the animation.
   */
  get timeScale(): number {
    return this._timeScale;
  }

  /**
   * The timeScale setter, timeScale which used for scale the animation time to speed up or slow down the animation.
   */
  set timeScale(val: number) {
    if (val > 0) {
      this._timeScale = val;
    }
  }

  /**
   * Linearly interpolates between two values.
   * @param outValue - The output value after interpolation.
   * @param startValue - The start value before interpolation.
   * @param endValue - The end value after interpolation.
   * @param outputSize - The length of the output values.
   * @param alpha - The weight of the endValue in interpolation algorithm.
   * @private
   */
  public static lerp(
    outValue: number | Float32Array,
    startValue: number | Float32Array,
    endValue: number | Float32Array,
    alpha: number,
    outputSize: number
  ): number | Float32Array {
    switch (outputSize) {
      case 1:
        outValue = <number>startValue * (1 - alpha) + <number>endValue * alpha;
        break;
      case 4:
        const start = new Quaternion(...(startValue as Float32Array));
        const end = new Quaternion(...(endValue as Float32Array));
        const quat = new Quaternion();
        Quaternion.slerp(start, end, alpha, quat);
        outValue[0] = quat.x;
        outValue[1] = quat.y;
        outValue[2] = quat.z;
        outValue[3] = quat.w;
        break;
      default:
        for (let i = outputSize; i >= 0; i--) {
          outValue[i] = startValue[i] * (1 - alpha) + endValue[i] * alpha;
        }
        break;
    } // End of switch.

    return outValue;
  }

  /** @internal */
  @ignoreClone
  _onUpdateIndex: number = -1;

  @shallowClone
  private _animSet = {};

  @ignoreClone
  private _animLayers: AnimationLayer[] = [new AnimationLayer()];
  @ignoreClone
  private _timeScale: number = 1.0;
  @ignoreClone
  private _channelTargets: IChannelTarget[] | false;

  /**
   * @param entity - The entitiy which the animation component belongs to.
   */
  constructor(entity: Entity) {
    super(entity);
  }

  /**
   * Evaluates the animation component based on deltaTime.
   * @param deltaTime - The deltaTime when the animation update.
   * @private
   */
  public update(deltaTime: number) {
    if (!this.isPlaying()) {
      return;
    }

    deltaTime = deltaTime * this._timeScale;

    // Update state.
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      const animLayer = this._animLayers[i];
      animLayer.updateState(deltaTime);
    }

    // Update value.
    this._updateValues();

    // Trigger events and destroy no use layer.
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      const animLayer = this._animLayers[i];
      animLayer.triggerEvents();
      if (!animLayer.isPlaying && (animLayer.isFading || animLayer.isMixLayer)) {
        this._animLayers.splice(i, 1);
        this._removeRefMixLayers(animLayer);
      }
    }
  }

  /**
   * Add a AnimationClip to the animation with the name.
   * @param animClip - The AnimationClip which you want to be added.
   * @param name - The name of the AnimationClip.
   */
  public addAnimationClip(animClip: AnimationClip, name: string) {
    this._animSet[name] = animClip;
  }

  /**
   * Remove clip from the animation.
   * @param name - The name of the AnimationClip.
   */
  public removeAnimationClip(name: string) {
    const animClip = this._animSet[name];
    if (animClip) {
      delete this._animSet[name];
    }
  }

  /**
   * Get length of the AnimationClip By the name.
   * @param name - The name of the AnimationClip.
   * @return The AnimationClip length.
   */
  public getAnimationClipLength(name: string): number {
    const animClip = this._animSet[name];
    if (animClip) {
      return animClip.getChannelTimeLength(0);
    } else {
      return 0.0;
    }
  }

  /**
   * Get the AnimationClip By name.
   * @param name - The name of the AnimationClip.
   * @return The AnimationClip which match the name.
   */
  public getAnimationClip(name: string): AnimationClip {
    return this._animSet[name] || null;
  }

  /**
   * Return whether is playing.
   * @return {boolean}
   */
  public isPlaying(): boolean {
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      if (this._animLayers[i].isPlaying) {
        return true;
      }
    }
    return false;
  }

  /**
   * Play the AnimationClip by name.
   * @param name - The AnimatioinClip's name.
   * @param options - The play options when playing AnimationClip.
   */
  public playAnimationClip(name: string, options?: AnimationOptions) {
    const animClip = this._animSet[name];
    if (!animClip) {
      Logger.error("can not find anim clip: " + name);
      return;
    }

    let animLayer: AnimationLayer = null;
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      if (!this._animLayers[i].isFading && !this._animLayers[i].isMixLayer) {
        animLayer = this._animLayers[i];
        break;
      }
    }

    if (!animLayer) {
      animLayer = new AnimationLayer();
      this._animLayers.push(animLayer);
    }
    this._removeRefMixLayers(animLayer);
    this._channelTargets = animLayer.play(animClip, this.entity, options);
  }

  /**
   * CrossFade to the AnimationClip by name.
   * @param name - The AnimatioinClip's name.
   * @param crossFadeDuration - The milliseconds of the crossFade's duration.
   * @param options - The play options when playing AnimationClip.
   */
  public CrossFade(name: string, crossFadeDuration: number, options: AnimationOptions) {
    const animClip = this._animSet[name];
    if (!animClip) {
      Logger.error("can not find anim clip: " + name);
      return;
    }

    if (!crossFadeDuration || crossFadeDuration < 0) {
      Logger.error("crossFadeDuration can not less than 0!");
      return;
    }

    // Look for targets that can be mixed.
    let targetAnimLayer = null;
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      if (this._animLayers[i].canMix(animClip, this.entity)) {
        targetAnimLayer = this._animLayers[i];
        break;
      }
    }

    if (targetAnimLayer) {
      // Clear the unfinished crossFading action
      for (let i = this._animLayers.length - 1; i >= 0; i--) {
        if (this._animLayers[i].isFading) {
          this._animLayers.splice(i, 1);
        }
      }

      targetAnimLayer.isFading = true;
      targetAnimLayer.fadeDuration = crossFadeDuration;
      targetAnimLayer.fadeDeltaTime = 0;

      const animLayer = new AnimationLayer();
      animLayer.crossFadeDuration = crossFadeDuration;
      animLayer.crossFadeDeltaTime = 0;
      animLayer.play(animClip, this.entity, options);
      this._animLayers.push(animLayer);
    } else {
      this.playAnimationClip(name, options);
    }
  }

  /**
   * Mix the AnimationClip by name.
   * @param name - The AnimatioinClip's name.
   * @param mixBoneName - Takes effect on the bone named mixBoneName and the child bones attached to it.
   * @param options - The play options when playing AnimationClip.
   */
  public mix(name: string, mixBoneName: string, options: AnimationOptions) {
    const animClip = this._animSet[name];
    if (!animClip) {
      Logger.error("can not find anim clip: " + name);
      return;
    }

    const mixNode = this.entity.findByName(mixBoneName);
    if (!mixNode) {
      Logger.error("can not find mix bone!");
      return;
    }

    // Look for targets that can be mixed.
    let targetAnimLayer = null;
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      if (this._animLayers[i].canMix(animClip, this.entity)) {
        targetAnimLayer = this._animLayers[i];
        break;
      }
    }

    if (targetAnimLayer) {
      this._removeRefMixLayers(null, mixNode);

      targetAnimLayer.hasMixLayer = true;

      const animLayer = new AnimationLayer();
      animLayer.isMixLayer = true;
      animLayer.mixTagetLayer = targetAnimLayer;
      animLayer.mixEntity = mixNode;
      animLayer.mix(animClip, targetAnimLayer, this.entity, mixNode, options);
      this._animLayers.push(animLayer);
    }
  }

  /**
   * Stop play
   * @param rightnow - Stop it immediately, or it will stop at the end of the clip
   */
  public stop(rightnow: boolean) {
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      if (this._animLayers[i].isFading) {
        this._animLayers.splice(i, 1);
      } else {
        this._animLayers[i].stop(rightnow);
      }
    }
  }

  /**
   * Jump to a frame of the animation, take effect immediately.
   * @param frameTime - The time which the animation will jump to.
   */
  public jumpToFrame(frameTime: number) {
    frameTime = frameTime / 1000;
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      this._animLayers[i].jumpToFrame(frameTime);
    }

    this._updateValues();
  }

  // -- private ----------------------------------------------------------
  /**
   * Remove the mixed animation associated with targetLayer.
   * @param targetLayer - The mixed AnimatioinLayer which will be removed.
   * @private
   */
  public _removeRefMixLayers(targetLayer: AnimationLayer, mixNode?) {
    if (targetLayer && targetLayer.hasMixLayer) {
      for (let i = this._animLayers.length - 1; i >= 0; i--) {
        const animLayer = this._animLayers[i];
        if (animLayer.isMixLayer && animLayer.mixTagetLayer === targetLayer) {
          animLayer.removeMixWeight();
          this._animLayers.splice(i, 1);
        }
      }
    }

    if (mixNode) {
      for (let i = this._animLayers.length - 1; i >= 0; i--) {
        const animLayer = this._animLayers[i];
        if (
          animLayer.isMixLayer &&
          (animLayer.mixEntity === mixNode ||
            animLayer.mixEntity.findByName(mixNode) ||
            mixNode.findByName(animLayer.mixEntity))
        ) {
          animLayer.removeMixWeight();
          this._animLayers.splice(i, 1);
        }
      }
    }
  }

  /**
   * Update animation value.
   * @private
   */
  public _updateValues() {
    if (this._animLayers.length === 0 || !this._channelTargets) {
      return;
    }

    for (let i = this._channelTargets.length - 1; i >= 0; i--) {
      const channelTarget = this._channelTargets[i];
      const val = this._getChannelValue(i, channelTarget.outputSize);
      const targetObject = channelTarget.targetObject;
      const path = channelTarget.path;

      if (path === "weights") {
        // SkinnedMeshRenderer.
        // (targetObject as SkinnedMeshRenderer).setWeights(val as any);
      } else {
        const v = val as Float32Array;
        //CM: Temporary optimization val should be Vector3/Quaternion type to avoid conversion overhead
        //CM: In the future, after Animation unifies all animation systems, it will use pathType as other and continue to use reflection.
        //CM: Due to the relatively small number of pathTypes, pre-classification can be used to avoid switch overhead in the future, such as three types of skeletal animation
        const transform = (<Entity>targetObject).transform;
        switch (channelTarget.pathType) {
          case TagetType.position:
            const position: Vector3 = transform.position;
            position.setValue(v[0], v[1], v[2]);
            transform.position = position;
            break;
          case TagetType.rotation:
            const rotation: Quaternion = transform.rotationQuaternion;
            rotation.setValue(v[0], v[1], v[2], v[3]);
            transform.rotationQuaternion = rotation;
            break;
          case TagetType.scale:
            const scale: Vector3 = transform.scale;
            scale.setValue(v[0], v[1], v[2]);
            transform.scale = scale;
            break;
          default:
            targetObject[path] = val;
        }
      }
    } // End of for
  }

  /**
   * @return Channel value.
   * @param channelIndex - The channel's index in AnimationClip's channels property.
   * @param outputSize - The length of the output values.
   * @private
   */
  public _getChannelValue(channelIndex: number, outputSize: number): number | boolean | Float32Array {
    const weights = [];
    const values = [];
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      const weight = this._animLayers[i].getChannelLayerWeight(channelIndex);
      if (weight > 0) {
        weights.push(weight);
        values.push(this._animLayers[i].getChannelValue(channelIndex));
      }
    }
    /**
     * When values.length === 1, return the value directly.
     * When values.length === 2, return the lerp from value[0] and value[1].
     **/
    if (values.length === 1) {
      return values[0];
    } else if (values.length === 2) {
      return Animation.lerp(values[0], values[0], values[1], weights[1], outputSize);
    }

    // Other case can't be handled.
    Logger.error("Can not get channel value!");
    return false;
  }

  /**
   * Be called when this instance be enabled.
   * @override
   * @internal
   */
  _onEnable(): void {
    this.engine._componentsManager.addOnUpdateAnimations(this);
  }

  /**
   * Be called when this instance be disabled or it's entity be inActiveInHierarchy or before this instance be destroyed.
   * @override
   * @internal
   */
  _onDisable(): void {
    this.engine._componentsManager.removeOnUpdateAnimations(this);
  }
}
