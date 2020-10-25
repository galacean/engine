import { Quaternion, Vector3 } from "@alipay/o3-math";
import { AnimationClip, TagetType } from "./AnimationClip";
import { AnimationLayer } from "./AnimationLayer";
import { AnimationOptions, IChannelTarget } from "./types";
import { Component } from "../Component";
import { Logger } from "../base/Logger";
import { Entity } from "../Entity";
import { SkinnedMeshRenderer } from "../mesh/SkinnedMeshRenderer";
import { deepClone, ignoreClone } from "../clone/CloneManager";
/**
 * 播放动画片段，动画片段所引用的对象必须是此组件的 Entity 及其子物体
 */
export class Animation extends Component {
  /**
   * 缩放播放速度
   * @member {number}
   */
  get timeScale(): number {
    return this._timeScale;
  }
  /**
   * 设置播放速度
   */
  set timeScale(val: number) {
    if (val > 0) {
      this._timeScale = val;
    }
  }

  /**
   * @param {Float32Array | number} outValue
   * @param {number} startValue
   * @param {number} endValue
   * @param {number} outputSize
   * @param {number} alpha
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
    } // end of switch

    return outValue;
  }

  /** @internal */
  @ignoreClone
  _onUpdateIndex: number = -1;

  @deepClone
  private _animSet = {};

  @ignoreClone
  private _animLayers: AnimationLayer[] = [new AnimationLayer()];
  @ignoreClone
  private _timeScale: number = 1.0;
  @ignoreClone
  private _channelTargets: IChannelTarget[] | false;

  /**
   * @param {Entity} entity
   */
  constructor(entity: Entity) {
    super(entity);
  }

  /**
   * 动画更新计算
   * @param {number} deltaTime
   * @private
   */
  public update(deltaTime: number) {
    if (!this.isPlaying()) {
      return;
    }

    deltaTime = deltaTime * this._timeScale;

    // update state
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      const animLayer = this._animLayers[i];
      animLayer.updateState(deltaTime);
    }

    // update value
    this._updateValues();

    // trigger events and destroy no use layer
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
   * 加载一个animClip
   * @param {AnimationClip} animClip 动画片段对象
   * @param {string} name 动画片段名称
   */
  public addAnimationClip(animClip: AnimationClip, name: string) {
    this._animSet[name] = animClip;
  }

  /**
   * 移除一个animClip
   * @param {string} name 动画片段的名称
   */
  public removeAnimationClip(name: string) {
    const animClip = this._animSet[name];
    if (animClip) {
      delete this._animSet[name];
    }
  }

  /**
   * 取得指定的 AnimationClip 的时间长度
   * @param {string} name 动画片段的名称
   * @return {number}
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
   * 取得指定的 AnimationClip
   * @param {string} name 动画片段的名称
   * @return {number}
   */
  public getAnimationClip(name: string): AnimationClip {
    return this._animSet[name] || null;
  }

  /**
   * 是否正在播放
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
   * 动画事件参数
   * @typedef {Object} AnimationEventOpt
   * @param {AnimationEvent} type 动画事件类型
   * @param {function} callback 回调
   * @param {float} triggerTime 触发时间，只有type === AnimationEvent.FRAME_EVENT 时配置
   */

  /**
   * 配置动画播放的参数
   * @typedef {Object} AnimationOptions
   * @param {WrapMode} wrapMode 动画播放方式，LOOP：循环，ONCE：仅一次
   * @param {AnimationEventOpt[]} events 动画事件
   */

  /**
   * 播放动画
   * @param {String} name 动画片段的名称
   * @param {AnimationOptions} options 动画参数
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
   * 动画混合过渡，因为动画混合过渡是一个比较消耗性能的操作，这里使用单独的接口crossFade
   * @param {string} name 动画片段的名称
   * @param {number} crossFadeDuration 动画切换需要的毫秒数
   * @param {AnimationOptions} options 动画参数
   */
  public crossFade(name: string, crossFadeDuration: number, options: AnimationOptions) {
    const animClip = this._animSet[name];
    if (!animClip) {
      Logger.error("can not find anim clip: " + name);
      return;
    }

    if (!crossFadeDuration || crossFadeDuration < 0) {
      Logger.error("crossFadeDuration can not less than 0!");
      return;
    }

    // 寻找可以进行混合的目标
    let targetAnimLayer = null;
    for (let i = this._animLayers.length - 1; i >= 0; i--) {
      if (this._animLayers[i].canMix(animClip, this.entity)) {
        targetAnimLayer = this._animLayers[i];
        break;
      }
    }

    if (targetAnimLayer) {
      // 先清除还未结束的crossFading动作
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
   * 动画混合切换，因为动画混合是一个比较消耗性能的操作，这里使用单独的接口mix
   * @param {string} name 混合动画片段的名称
   * @param {string} mixBoneName 混合动画对名为mixBoneName的骨骼以及附属在其上的子骨骼生效
   * @param {AnimationOptions} options 动画参数
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

    // 寻找可以进行混合的目标
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
   * 停止播放
   * @param {boolean} rightnow, stop it immediately, or it will stop at the end of the clip
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
   * 跳转到动画的某一帧，立刻生效
   * @param {float} frameTime
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
   * 移除和mixTargetLayer关联的混合动画
   * @param {AnimationLayer} mixTargetLayer
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
   * update animation value
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
        // SkinnedMeshRenderer
        (targetObject as SkinnedMeshRenderer).setWeights(val as any);
      } else {
        const v = val as Float32Array;
        //CM: 临时优化 val 应该为Vector3/Quaternion类型，避免转换开销
        //CM: 未来Animation统一所有动画系统后 非常用pathType为other，继续走反射
        //CM: 由于pathType种类比较少，未来可以通过预分类避免switch开销，比如骨骼动画就三种类型
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
    } // end of for
  }

  /**
   * @return channel value
   * @param {number} channelIndex
   * @param {number} outputSize
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

    if (values.length === 1) {
      // 一个值生效，直接返回结果
      return values[0];
    } else if (values.length === 2) {
      // 两个值生效，插值返回
      return Animation.lerp(values[0], values[0], values[1], weights[1], outputSize);
    }

    // 其他情况，是暂时处理不了的
    Logger.error("Can not get channel value!");
    return false;
  }

  /**
   * 被激活时调用
   * @override
   * @internal
   */
  _onEnable(): void {
    this.engine._componentsManager.addOnUpdateAnimations(this);
  }

  /**
   * entity inActiveInHierarchy时 或 组件销毁前调用
   * @override
   * @internal
   */
  _onDisable(): void {
    this.engine._componentsManager.removeOnUpdateAnimations(this);
  }
}
