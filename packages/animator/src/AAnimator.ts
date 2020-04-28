import { Node, NodeAbility } from "@alipay/o3-core";
import { AAnimation } from "./AAnimation";
import { PlayState, WrapMode } from "./AnimationConst";

/**
 * 全局动画控制器
 */
export class AAnimator extends NodeAbility {
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
   * @param {Node} node
   */
  constructor(node: Node, props: any) {
    super(node);
    const { animatorData, wrapMode, autoPlay } = props;
    this.animationList = [];
    this.startTimeAnimationMap = {}; // startTime: AnimationList
    this._timeScale = 1.0;
    this.currentTime = 0;
    this.wrapMode = wrapMode;
    this.autoPlay = autoPlay;
    this.animatorData = animatorData;
    this.state = PlayState.INIT;
    if (animatorData) {
      animatorData.onAttach = data => {
        this.animatorData = data;
        if (autoPlay) {
          this.play();
        }
      };
    }
  }

  public update(deltaTime: number) {
    if (this.state !== PlayState.PLAYING) return;
    const { duration, startTimeAnimationMap, wrapMode } = this;
    deltaTime = deltaTime * this._timeScale;
    super.update(deltaTime);
    if (this.currentTime > duration) {
      this.reset();
      if (wrapMode === WrapMode.LOOP) {
        this.play();
      }
    }
    this.currentTime += deltaTime;
    Object.keys(startTimeAnimationMap).forEach(startTime => {
      if (this.currentTime - Number(startTime) >= 0) {
        const animationList = startTimeAnimationMap[startTime];
        animationList.forEach(animation => {
          animation.onAnimUpdate(deltaTime);
        });
      }
    });
  }

  public addAnimationByStartTime(startTime: number, animation: AAnimation) {
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
    Object.keys(keyframes).forEach(startTime => {
      const keyframesList = keyframes[startTime] || [];
      keyframesList.forEach(keyframe => {
        this.addAnimationByStartTime(Number(startTime), keyframe);
      });
    });
    this.duration = duration || Infinity;
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
      this.animationList.forEach(animation => {
        animation.playByAnimator();
      });
    }
    this.state = PlayState.PLAYING;
  }

  /**
   * 暂停播放
   *
   */
  public pause() {
    this.state = PlayState.PAUSUE;
    this.animationList.forEach(animation => {
      animation.pause();
    });
  }

  public stop() {
    this.pause();
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
    this.animationList.forEach(animation => {
      animation.reset();
    });
    this.state = PlayState.INIT;
  }
}
