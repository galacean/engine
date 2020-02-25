import { NodeAbility, Node } from "@alipay/o3-core";
import { AnimationClip } from "./AnimationClip";
import { getAnimationClipHander } from "./handler/index";
import { AnimationClipHandler } from "./handler/animationClipHandler";
import { WrapMode } from "./AnimationConst";
/**
 * 播放动画片段，动画片段所引用的对象必须是此组件的 Node 及其子节点
 * @extends NodeAbility
 * @see class AnimationClip
 */
export class AAnimation extends NodeAbility {
  /**
   * 当前播放时间
   */
  public currentTime: number;
  public duration: number;
  public state: string;
  private _wrapMode: WrapMode;
  private animClipSet;
  private uniqueAnimClipSet;
  private startTimeAnimClipSet;
  private handlerList: Array<any>;
  private binHandlerMap: any;
  private handlerStartTimeMap: WeakMap<AnimationClipHandler, number>;
  private _animationData: any;
  private _timeScale: number;

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

  get wrapMode() {
    return this._wrapMode;
  }
  set wrapMode(wrapMode) {
    this._wrapMode = wrapMode;
  }

  get animationData() {
    return this._animationData;
  }
  set animationData(animationData) {
    if (!animationData) return;
    this._animationData = animationData;
  }

  /**
   * @constructor
   * @param {Node} node
   */
  constructor(node: Node, props: any) {
    super(node);
    const { animationData, wrapMode } = props;
    this.animClipSet = {}; // name : AnimationClip
    this.uniqueAnimClipSet = {};
    this.startTimeAnimClipSet = {}; // startTime: AnimationClip
    this.handlerList = [];
    this.binHandlerMap = {};
    this.handlerStartTimeMap = new WeakMap();
    this._timeScale = 1.0;
    this.currentTime = 0;
    this.animationData = animationData;
    this.wrapMode = wrapMode;
    this.state = "init";
  }

  /**
   * 动画更新计算
   * @param {number} deltaTime
   * @private
   */
  public update(deltaTime: number) {
    if (this.state !== "playing") return;
    const { duration, handlerStartTimeMap, wrapMode } = this;
    deltaTime = deltaTime * this._timeScale;
    super.update(deltaTime);
    if (this.currentTime > duration) {
      this.reset();
      if (wrapMode === WrapMode.LOOP) {
        this.play();
      }
    }
    this.currentTime += deltaTime;
    this.handlerList.forEach(handler => {
      const handlerStartTime = handlerStartTimeMap.get(handler);
      if (this.currentTime > handlerStartTime) {
        handler.update(deltaTime);
      }
    });
  }
  //TODO 临时方案后面改为jumptoFrame
  public onAnimUpdate(deltaTime: number) {
    if (this.state !== "playingByAnimator") return;
    const { duration, handlerStartTimeMap, wrapMode } = this;
    deltaTime = deltaTime * this._timeScale;
    if (this.currentTime > duration) {
      this.reset();
      if (wrapMode === WrapMode.LOOP) {
        this.playByAnimator();
      }
    }
    this.currentTime += deltaTime;
    this.handlerList.forEach(handler => {
      const handlerStartTime = handlerStartTimeMap.get(handler);
      if (this.currentTime > handlerStartTime) {
        handler.update(deltaTime);
      }
    });
  }
  /**
   * 添加animClip
   * @param {number} startTime 开始时间
   * @param {AnimationClip} animClip 动画片段对象
   */
  public addAnimationClip(startTime: number, animClip: AnimationClip) {
    const name = animClip.name;
    if (this.uniqueAnimClipSet[`${name}_${startTime}`]) return;
    this.animClipSet[name] = animClip;
    this.uniqueAnimClipSet[`${name}_${startTime}`] = animClip;
    this.startTimeAnimClipSet[startTime] = this.startTimeAnimClipSet[startTime] || [];
    this.startTimeAnimClipSet[startTime].push(animClip);
    this.binHandlerMap[name] = this.binHandlerMap[name] || {};
    const hasBind = this.binHandlerMap[name][startTime];
    if (!hasBind) {
      const handler = getAnimationClipHander(this.node, animClip);
      this.handlerStartTimeMap.set(handler, startTime);
      this.handlerList.push(handler);
      this.binHandlerMap[name][startTime] = handler;
    }
  }
  public removeHandler(name, startTime) {
    const { handlerList } = this;
    const handler = this.binHandlerMap[name][startTime];
    for (let i = handlerList.length - 1; i >= 0; --i) {
      if (handlerList[i].id === handler.id) {
        handlerList.splice(i, 1);
        break;
      }
    }
    this.handlerStartTimeMap.delete(handler);
    delete this.binHandlerMap[name][startTime];
  }

  /**
   * 移除一个animClip
   * @param {string} name 动画片段的名称
   */
  public removeAnimationClip(name: string) {
    const animClip = this.animClipSet[name];
    if (animClip) {
      Object.keys(this.startTimeAnimClipSet).forEach(startTime => {
        let deletIndex = null;
        this.startTimeAnimClipSet[startTime].forEach((animClip, index) => {
          if (animClip.name === name) {
            deletIndex = index;
            this.removeHandler(name, startTime);
            delete this.uniqueAnimClipSet[`${name}_${startTime}`];
            delete this.startTimeAnimClipSet[startTime][deletIndex];
          }
        });
      });
      delete this.animClipSet[name];
    }
  }

  public removeAllAnimationClip() {
    const { animClipSet } = this;
    Object.keys(animClipSet).forEach(name => {
      this.removeAnimationClip(name);
    });
  }

  protected parseAnimationData() {
    const { keyFrames = {}, timeScale = 1, duration = Infinity } = this.animationData || {};
    this.removeAllAnimationClip();
    Object.keys(keyFrames).forEach(startTime => {
      const keyFramesList = keyFrames[startTime];
      keyFramesList.forEach(keyFrame => {
        this.addAnimationClip(Number(startTime), keyFrame);
      });
    });
    this.duration = duration || Infinity;
    this.timeScale = timeScale;
  }

  /**
   * 开始播放
   */
  public play() {
    if (this.state === "init" || this.state === "stop") {
      this.parseAnimationData();
    }
    this.state = "playing";
  }

  public playByAnimator() {
    if (this.state === "init" || this.state === "stop") {
      this.parseAnimationData();
    }
    this.state = "playingByAnimator";
  }

  /**
   * 暂停播放
   *
   */
  public pause() {
    this.state = "pause";
  }

  public stop() {
    this.pause();
    this.reset();
    this.state = "stop";
  }
  /**
   * 跳转到动画的某一帧，立刻生效
   * @param {float} frameTime
   */
  public jumpToFrame(frameTime: number) {}

  public reset() {
    this.currentTime = 0;
    this.pause();
    this.handlerList.reverse().forEach(handler => {
      handler.reset();
    });
    this.state = "init";
  }
}
