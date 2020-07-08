import { Event } from "@alipay/o3-base";
import { Node, Component } from "@alipay/o3-core";
import { AnimationClip } from "./AnimationClip";
import { PlayState, WrapMode } from "./AnimationConst";
import { AnimationClipHandler } from "./handler/animationClipHandler";
import { getAnimationClipHander } from "./handler/index";
/**
 * 播放动画片段，动画片段所引用的对象必须是此组件的 Node 及其子节点
 * @extends Component
 * @see class AnimationClip
 */
export class AAnimation extends Component {
  /**
   * 当前播放时间
   */
  public currentTime: number;
  public duration: number;
  public state: PlayState;
  private _wrapMode: WrapMode;
  private animClipSet;
  private uniqueAnimClipSet;
  private startTimeAnimClipSet;
  private handlerList: Array<any>;
  private binHandlerMap: any;
  private handlerStartTimeMap: WeakMap<AnimationClipHandler, number>;
  private _animationData: any;
  private _timeScale: number;
  private _autoPlay: boolean;

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

  get autoPlay() {
    return this._autoPlay;
  }
  set autoPlay(autoPlay) {
    this._autoPlay = autoPlay;
    if (!autoPlay) {
      this.stop();
    } else {
      this.play();
    }
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
    super(node, props);
    const { animationData, duration, wrapMode, autoPlay } = props;
    this.animClipSet = {}; // name : AnimationClip
    this.uniqueAnimClipSet = {};
    this.startTimeAnimClipSet = {}; // startTime: AnimationClip
    this.handlerList = [];
    this.binHandlerMap = {};
    this.handlerStartTimeMap = new WeakMap();
    this._timeScale = 1.0;
    this.currentTime = 0;
    this.wrapMode = wrapMode;
    this.duration = duration || Infinity;
    this.autoPlay = autoPlay;
    this.animationData = animationData;
    this.state = PlayState.INIT;
    if (autoPlay) {
      this.play();
    }
  }

  private _animate(deltaTime, rePlayFunc) {
    const { duration, handlerStartTimeMap, wrapMode } = this;
    deltaTime = deltaTime * this._timeScale;
    if (this.currentTime > duration) {
      if (wrapMode === WrapMode.LOOP) {
        this.reset();
        rePlayFunc.call(this);
      } else {
        this._finished();
      }
    }
    this.currentTime += deltaTime;
    this.handlerList.forEach((handler) => {
      const handlerStartTime = handlerStartTimeMap.get(handler);
      if (this.currentTime > handlerStartTime) {
        handler.update(deltaTime);
      }
    });
  }

  /**
   * 动画更新计算
   * @param {number} deltaTime
   * @private
   */
  public update(deltaTime: number) {
    if (this.state !== PlayState.PLAYING) return;
    this._animate(deltaTime, this.play);
  }

  public onAnimUpdate(deltaTime: number) {
    if (this.state !== PlayState.PLAYBYANIMATOR) return;
    this._animate(deltaTime, this.playByAnimator);
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
      Object.keys(this.startTimeAnimClipSet).forEach((startTime) => {
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
    Object.keys(animClipSet).forEach((name) => {
      this.removeAnimationClip(name);
    });
  }

  protected parseAnimationData() {
    const { keyframes = {}, timeScale = 1, duration = Infinity } = this.animationData || {};
    this.removeAllAnimationClip();
    Object.keys(keyframes).forEach((startTime) => {
      const keyframesList = keyframes[startTime];
      keyframesList.forEach((keyframe) => {
        this.addAnimationClip(Number(startTime), keyframe);
      });
    });
    this.duration = duration;
    this.timeScale = timeScale;
  }

  private _prePlay() {
    if (this.state === PlayState.INIT || this.state === PlayState.STOP) {
      if (this.animationData) {
        this.parseAnimationData();
      }
    }
  }

  /**
   * 开始播放
   */
  public play() {
    this._prePlay();
    this.state = PlayState.PLAYING;
  }

  public playByAnimator() {
    this._prePlay();
    this.state = PlayState.PLAYBYANIMATOR;
  }

  /**
   * 暂停播放
   *
   */
  public pause() {
    this.state = PlayState.PAUSUE;
  }

  public stop() {
    this.reset();
    this.state = PlayState.STOP;
  }
  /**
   * 跳转到动画的某一帧，立刻生效
   * @param {float} frameTime
   */
  public jumpToFrame(frameTime: number) {}

  public reset() {
    this.currentTime = 0;
    this.pause();
    this.handlerList.reverse().forEach((handler) => {
      handler.reset();
    });
    this.state = PlayState.INIT;
  }

  private _finished() {
    this.state = PlayState.STOP;
    const event = new Event("animationFinished");
    event.data = this;
    this.node.trigger(event);
  }
}
