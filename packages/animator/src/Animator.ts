import { Event } from "@alipay/o3-base";
import { Entity, Script } from "@alipay/o3-core";
import { Animation } from "./Animation";
import { PlayState, WrapMode } from "./AnimationConst";

/**
 * 全局动画控制器
 */
export class Animator extends Script {
  public currentTime: number;
  public duration: number;
  public startTimeAnimationMap: any;
  public animationList: Array<any>;
  public state: PlayState;
  private _animatorData: any;
  private _timeScale: number;
  private _wrapMode: WrapMode;
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

  get animatorData() {
    return this._animatorData;
  }

  set animatorData(animatorData) {
    if (!animatorData) return;
    this._animatorData = animatorData;
  }

  /**
   * @constructor
   * @param {Entity} entity
   */
  constructor(entity: Entity, props: any) {
    super(entity, props);
    const { animatorData, duration, wrapMode, autoPlay } = props;
    this.animationList = [];
    this.startTimeAnimationMap = {}; // startTime: AnimationList
    this._timeScale = 1.0;
    this.currentTime = 0;
    this.duration = duration || Infinity;
    this.wrapMode = wrapMode;
    this.autoPlay = autoPlay;
    this.animatorData = animatorData;
    this.state = PlayState.INIT;
    if (animatorData) {
      animatorData.onAttach = (data) => {
        this.animatorData = data;
        if (autoPlay) {
          this.play();
        }
      };
    }
  }

  public onUpdate(deltaTime: number) {
    if (this.state !== PlayState.PLAYING) return;
    const { duration, startTimeAnimationMap, wrapMode } = this;
    deltaTime = deltaTime * this._timeScale;
    super.onUpdate(deltaTime);
    if (this.currentTime > duration) {
      if (wrapMode === WrapMode.LOOP) {
        this.replay();
      } else {
        this._finished();
      }
    }
    this.currentTime += deltaTime;
    Object.keys(startTimeAnimationMap).forEach((startTime) => {
      if (this.currentTime - Number(startTime) >= 0) {
        const animationList = startTimeAnimationMap[startTime];
        animationList.forEach((animation) => {
          animation.onAnimUpdate(deltaTime);
        });
      }
    });
  }

  public addAnimationByStartTime(startTime: number, animation: Animation) {
    this.startTimeAnimationMap[startTime] = this.startTimeAnimationMap[startTime] || [];
    this.startTimeAnimationMap[startTime].push(animation);
    this.animationList.push(animation);
  }

  public removeAllAnimation() {
    this.startTimeAnimationMap = [];
    this.animationList = [];
  }

  protected parseAnimatorData() {
    const { options: { keyframes = {}, timeScale = 1, duration = Infinity } = {} } = this.animatorData;
    this.removeAllAnimation();
    Object.keys(keyframes).forEach((startTime) => {
      const keyframesList = keyframes[startTime] || [];
      keyframesList.forEach((keyframe) => {
        this.addAnimationByStartTime(Number(startTime), keyframe);
      });
    });
    this.duration = duration;
    this.timeScale = timeScale;
  }

  /**
   * 开始播放
   */
  public play() {
    if (this.state === PlayState.INIT || this.state === PlayState.STOP) {
      if (this.animatorData) {
        this.parseAnimatorData();
      }
      this.animationList.forEach((animation) => {
        animation.playByAnimator();
      });
    }
    this.state = PlayState.PLAYING;
  }

  public replay() {
    this.reset();
    this.play();
  }

  /**
   * 暂停播放
   *
   */
  public pause() {
    this.state = PlayState.PAUSUE;
    this.animationList.forEach((animation) => {
      animation.pause();
    });
  }

  public stop() {
    this.animationList.forEach((animation) => {
      animation.stop();
    });
    this.reset();
    this.state = PlayState.STOP;
  }

  private _finished() {
    this.state = PlayState.STOP;
    const event = new Event("animatorFinished");
    event.data = this;
    this.engine.trigger(event);
  }

  /**
   * 跳转到动画的某一帧，立刻生效
   * @param {float} frameTime
   */
  public jumpToFrame(frameTime: number) {}

  public reset() {
    this.currentTime = 0;
    this.pause();
    this.animationList.forEach((animation) => {
      animation.reset();
    });
    this.state = PlayState.INIT;
  }
}
