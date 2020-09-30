import { Event } from "../base/Event";
import { EventDispatcher } from "../base/EventDispatcher";
import { Logger } from "../base/Logger";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { SkinnedMeshRenderer } from "../mesh/SkinnedMeshRenderer";
import { AnimationClip } from "./AnimationClip";
import { AnimationEvent, WrapMode } from "./AnimationConst";
import { AnimationOptions, IChannelState, IChannelTarget } from "./types";

/**
 * AnimationClip playback
 * @extends EventDispatcher
 * @see class AnimationClip
 * @private
 */
export class AnimationLayer extends EventDispatcher {
  /**
   * @return is playing˝
   */
  get isPlaying(): boolean {
    return this._animClip && this._isPlaying;
  }

  public layerWeight: number;

  public mixTagetLayer: AnimationLayer;

  public isFading: number;

  public fadeDeltaTime: number;

  public crossFadeDuration: number;

  public fadeDuration: number;

  public crossFadeDeltaTime: number;

  public isMixLayer: boolean;

  public hasMixLayer: boolean;

  public mixEntity: Entity;

  private _activedEvents: Event[];

  private _animClip: AnimationClip;

  private _isPlaying: boolean;

  private _wrapMode: WrapMode;

  private _channelStates: IChannelState[];

  private _animClipLength: number;

  private _frameEvents: any[];

  /**
   * @constructor
   */
  constructor() {
    super();

    this.layerWeight = 1.0;

    this._activedEvents = [];
  }

  /**
   * @param {AnimationClip} nextAnimClip, anim clip to playback next
   * @param {Entity} rootEntity
   * @return can mix with current AnimationClip
   */
  public canMix(nextAnimClip: AnimationClip, rootEntity: Entity): boolean {
    if (!this._animClip || !this._isPlaying || this.isMixLayer || this.isFading) {
      return false;
    }

    if (this._animClip.getChannelCount() !== nextAnimClip.getChannelCount()) {
      return false;
    }

    const count = this._animClip.getChannelCount();
    for (let i = count - 1; i >= 0; i--) {
      const curChannel = this._animClip.getChannelObject(i);
      const curTargetObject = this._findChannelTarget(rootEntity, curChannel.target);

      const nextChannel = nextAnimClip.getChannelObject(i);
      const nextTargetObject = this._findChannelTarget(rootEntity, nextChannel.target);

      if (curTargetObject !== nextTargetObject) {
        return false;
      }
    }

    return true;
  }

  /**
   * mix animClip with target animationLayer
   * @param {AnimationClip} animClip, anim clip to mix
   * @param {AnimationLayer} targetLayer, target animationLayer
   * @param {Entity} rootEntity, root node of skeleton animation
   * @param {Entity} mixNode, mix bone node
   * @param {AnimationOptions} options, animation events options
   */
  public mix(
    animClip: AnimationClip,
    targetLayer: AnimationLayer,
    rootEntity: Entity,
    mixEntity: Entity,
    options: { wrapMode?: WrapMode } = {}
  ) {
    this._isPlaying = targetLayer.isPlaying;
    this._animClip = animClip;
    this._wrapMode = typeof options.wrapMode !== "undefined" ? options.wrapMode : targetLayer._wrapMode;

    this._addEvents(options);

    this._channelStates = [];
    this._animClipLength = 0;

    // -- create new state object
    if (this._isPlaying) {
      const targetChannelStates = targetLayer._channelStates;
      const count = this._animClip.getChannelCount();
      for (let i = count - 1; i >= 0; i--) {
        const channel = this._animClip.getChannelObject(i);
        const targetObject = this._findChannelTarget(mixEntity, channel.target);
        this._channelStates[i] = {
          frameTime: 0.0,
          currentFrame: 0,
          currentValue: this._animClip.createChannelValue(i),
          mixWeight: targetObject ? 1 : 0
        };

        targetChannelStates[i].mixWeight =
          targetChannelStates[i].mixWeight === undefined ? 1 : targetChannelStates[i].mixWeight;
        if (targetChannelStates[i].mixWeight === 1) {
          targetChannelStates[i].mixWeight = targetObject ? 0 : 1;
        }

        const channelTimeLength = this._animClip.getChannelTimeLength(i);
        this._animClipLength = this._animClipLength > channelTimeLength ? this._animClipLength : channelTimeLength;
      } // end of for

      return true;
    }

    return false;
  }

  public removeMixWeight() {
    const count = this._channelStates.length;
    for (let i = count - 1; i >= 0; i--) {
      if (this._channelStates[i].mixWeight === 1) {
        this.mixTagetLayer._channelStates[i].mixWeight = 1;
      }
    }
  }

  /**
   * play specify anim clip
   * @param {AnimationClip} animClip, anim clip to playback
   * @param {Entity} rootEntity, root node of Skeleton Animation
   * @param {AnimationOptions} options
   */
  public play(
    animClip: AnimationClip,
    rootEntity: Entity,
    options: AnimationOptions = { wrapMode: WrapMode.LOOP }
  ): false | IChannelTarget[] {
    this._isPlaying = !!animClip;
    this._animClip = animClip;
    this._wrapMode = typeof options.wrapMode !== "undefined" ? options.wrapMode : WrapMode.LOOP;

    this._addEvents(options);

    this._channelStates = [];
    this._animClipLength = 0;

    // -- create new state object
    if (this._isPlaying) {
      const count = this._animClip.getChannelCount();
      const channelTargets: IChannelTarget[] = [];
      for (let i = count - 1; i >= 0; i--) {
        const channel = this._animClip.getChannelObject(i);
        const targetObject = this._findChannelTarget(rootEntity, channel.target);
        if (!targetObject) {
          Logger.warn("Can not find channel target:" + channel.target.id);
        }
        this._channelStates[i] = {
          frameTime: 0.0,
          currentFrame: 0,
          currentValue: this._animClip.createChannelValue(i)
        };

        channelTargets[i] = {
          targetObject,
          path: channel.target.path,
          pathType: channel.target.pathType,
          outputSize: channel.sampler.outputSize
        };

        const channelTimeLength = this._animClip.getChannelTimeLength(i);
        this._animClipLength = this._animClipLength > channelTimeLength ? this._animClipLength : channelTimeLength;
      } // end of for

      return channelTargets;
    }

    return false;
  }

  /**
   * stop play anim clip
   * @param {boolean} rightnow stop it immediately, or it will stop at the end of the clip
   */
  public stop(rightnow: boolean) {
    if (!this._animClip || !this._isPlaying) {
      return;
    }

    if (rightnow) {
      this._isPlaying = false;
    } else {
      this._wrapMode = WrapMode.ONCE;
    }
  }

  /**
   * update animation states only
   * @param {number} deltaTime
   */
  public updateState(deltaTime: number) {
    if (!this._animClip || !this._isPlaying) {
      return;
    }

    // 更新Animation Layer 的权重
    if (this.isFading) {
      this.fadeDeltaTime += deltaTime;
      this.layerWeight = 1.0 - this.fadeDeltaTime / this.fadeDuration;
      if (this.layerWeight <= 0) {
        this._isPlaying = false;
      }
    } else if (this.crossFadeDuration) {
      this.crossFadeDeltaTime += deltaTime;
      this.layerWeight = this.crossFadeDeltaTime / this.crossFadeDuration;
      if (this.layerWeight >= 1.0) {
        this.layerWeight = 1.0;
        delete this.crossFadeDuration;
      }
    }

    deltaTime = deltaTime / 1000;
    this._activeEvents(deltaTime);

    // -- update channelStates
    const count = this._animClip.getChannelCount();
    let playingCount = 0;
    for (let i = count - 1; i >= 0; i--) {
      if (this._updateChannelState(deltaTime, i)) {
        playingCount++;
      }
    }

    if (playingCount === 0) {
      this._isPlaying = false;

      if (this.isMixLayer) {
        this.removeMixWeight();
      }
    }
  }

  /**
   * @return channel layer weight
   * @param {number} channelIndex
   */
  public getChannelLayerWeight(channelIndex: number): number {
    if ((this.hasMixLayer || this.isMixLayer) && channelIndex < this._channelStates.length) {
      const mixWeight = this._channelStates[channelIndex].mixWeight;
      const layerWeight = this.isMixLayer ? this.mixTagetLayer.layerWeight : this.layerWeight;
      return mixWeight * layerWeight;
    }
    return this.layerWeight;
  }

  /**
   * @return channel value
   * @param {number} channelIndex
   */
  public getChannelValue(channelIndex: number) {
    return this._channelStates[channelIndex].currentValue;
  }

  /**
   * 触发动画事件
   */
  public triggerEvents() {
    this._activedEvents &&
      this._activedEvents.forEach((event) => {
        this.trigger(event);
      });

    this._activedEvents.length = 0;
  }

  /**
   * 跳转到某一帧
   * @param {number} frameTime
   */
  public jumpToFrame(frameTime: number) {
    const count = this._animClip.getChannelCount();
    for (let i = count - 1; i >= 0; i--) {
      // 1. - clear pre frameTime
      const channelState = this._channelStates[i];
      channelState.frameTime = 0;

      // 2. - update new frameTime
      this._updateChannelState(frameTime, i);
    }
  }

  /**
   * update state and value of channel
   * @param {float} deltaTime
   * @param {number} channelIndex
   * @private
   */
  public _updateChannelState(deltaTime, channelIndex) {
    const animClip = this._animClip;
    const channelState = this._channelStates[channelIndex];
    const animClipLength = animClip.getChannelTimeLength(channelIndex);

    channelState.frameTime += deltaTime;
    if (channelState.frameTime > animClipLength) {
      switch (this._wrapMode) {
        case WrapMode.ONCE:
          channelState.frameTime = animClipLength;
          break;
        case WrapMode.LOOP:
          channelState.frameTime = channelState.frameTime % this._animClipLength;
          break;
        default:
          Logger.error("Unknown Anim wrap Mode: " + this._wrapMode);
      }
    } // end of if

    if (channelState.mixWeight && channelState.mixWeight === 0) {
      return true;
    }

    const frameTime = Math.min(channelState.frameTime, animClipLength);
    const lerpState = this._getKeyAndAlpha(animClip.getChannelObject(channelIndex), frameTime);
    channelState.currentValue = animClip.evaluate(
      channelState.currentValue,
      channelIndex,
      lerpState.currentKey,
      lerpState.nextKey,
      lerpState.alpha
    );

    if (this._wrapMode === WrapMode.ONCE && channelState.frameTime >= animClipLength) {
      return false;
    }
    return true;
  }
  // -- private ----------------------------------------------------------
  /**
   * @param {Object} add animation events
   * @private
   */
  private _addEvents(options: any) {
    this.removeAllEventListeners();

    this._frameEvents = [];
    if (options.events) {
      let frameEventIndex = 0;
      for (let i = options.events.length - 1; i >= 0; i--) {
        const event = options.events[i];
        let eventType = event.type;
        if (event.type === AnimationEvent.FRAME_EVENT) {
          eventType = "frameEvent" + frameEventIndex;
          frameEventIndex++;
          this._frameEvents.push({
            eventType,
            triggerTime: event.triggerTime,
            triggered: false
          });
        }
        this.addEventListener(eventType, (e) => {
          event.callback();
        });
      } // end of for
    } // end of if
  }

  /**
   * 激活动画事件
   * @param {number} deltaTime
   * @private
   */
  private _activeEvents(deltaTime: number) {
    // 触发Frame Event
    const index = this._animClip.durationIndex;

    if (this._frameEvents.length > 0 && this._channelStates.length > 0) {
      const curFrameTime = this._channelStates[index].frameTime + deltaTime;
      for (let i = this._frameEvents.length - 1; i >= 0; i--) {
        const frameEvent = this._frameEvents[i];
        if (!frameEvent.triggered && curFrameTime > frameEvent.triggerTime) {
          this._activedEvents.push(new Event(frameEvent.eventType, this));
          frameEvent.triggered = true;
        }
      }
    }

    if (this._channelStates.length > 0 && this._channelStates[index].frameTime + deltaTime >= this._animClip.duration) {
      if (this._wrapMode === WrapMode.LOOP) {
        // 重置Frame Event状态
        if (this._frameEvents.length > 0) {
          for (let i = this._frameEvents.length - 1; i >= 0; i--) {
            this._frameEvents[i].triggered = false;
          }
        }
        // 激活Loop End Event
        if (this.hasEvent(AnimationEvent.LOOP_END)) {
          this._activedEvents.push(new Event(AnimationEvent.LOOP_END, this));
        }
      } else if (this.hasEvent(AnimationEvent.FINISHED)) {
        // 激活Finish Event
        this._activedEvents.push(new Event(AnimationEvent.FINISHED, this));
      }
    }
  }

  /**
   * update state of channel
   * @param {Entity} rootNode
   * @param {object} target
   * @private
   */
  private _findChannelTarget(rootNode: Entity, target: any): Entity | Component {
    const targetID = target.id;
    let targetSceneObject: Entity = null;
    if (rootNode.name === targetID) {
      targetSceneObject = rootNode;
    } else {
      targetSceneObject = rootNode.findByName(targetID);
    }

    if (target.path === "weights") {
      return targetSceneObject.getComponent(SkinnedMeshRenderer);
    } else {
      return targetSceneObject;
    }
  }

  /**
   * @return current and next key id, current alpha
   * @param {number} channel
   * @param {float} time
   * @private
   */
  private _getKeyAndAlpha(channel, time: number) {
    let keyTime = 0;
    let currentKey = 0;
    let nextKey = 0;

    const timeKeys = channel.sampler.input;
    const numKeys = timeKeys.length;
    for (let i = numKeys - 1; i >= 0; i--) {
      if (time > timeKeys[i]) {
        keyTime = time - timeKeys[i];
        currentKey = i;
        break;
      }
    }

    nextKey = currentKey + 1;
    if (nextKey >= numKeys) {
      switch (this._wrapMode) {
        case WrapMode.ONCE:
          nextKey = numKeys - 1;
          break;
        case WrapMode.LOOP:
          nextKey = 0;
          break;
      }
    }

    const keyLength = timeKeys[nextKey] - timeKeys[currentKey];
    const alpha = nextKey === currentKey || keyLength < 0.00001 ? 1 : keyTime / keyLength;

    return {
      currentKey,
      nextKey,
      alpha
    };
  }
}
