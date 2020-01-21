import { NodeAbility, Node } from "@alipay/o3-core";
import { AAnimation } from "./AAnimation";

/**
 * 全局动画控制器
 */
export class AAnimator extends NodeAbility {
  public currentTime: number;
  public duration: number;
  public startTimeAnimationMap: any;
  public animationList: Array<any>;
  private _animatorData: any;
  private _isPlaying: boolean;
  private _timeScale: number;
  private needParse: boolean;

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

  get animatorData() {
    return this._animatorData;
  }

  set animatorData(animatorData) {
    if (!animatorData) return;
    this.needParse = true;
    this._animatorData = animatorData;
  }

  /**
   * @constructor
   * @param {Node} node
   */
  constructor(node: Node, props: any) {
    super(node);
    const { animatorData } = props;
    this.animationList = [];
    this.startTimeAnimationMap = {}; // startTime: AnimationList
    this._timeScale = 1.0;
    this.currentTime = 0;
    this.animatorData = animatorData;
    if (animatorData) {
      animatorData.onAttach = data => {
        this.animatorData = data;
      };
    }
  }

  public update(deltaTime: number) {
    if (!this._isPlaying) return;
    const { duration, startTimeAnimationMap } = this;
    deltaTime = deltaTime * this._timeScale;
    super.update(deltaTime);
    if (this.currentTime > duration) {
      this.reset();
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
    const { options: { keyFrames = {}, timeScale = 1, duration = Infinity } = {} } = this.animatorData;
    this.removeAllAnimation();
    Object.keys(keyFrames).forEach(startTime => {
      const keyFramesList = keyFrames[startTime] || [];
      keyFramesList.forEach(keyFrame => {
        this.addAnimationByStartTime(Number(startTime), keyFrame);
      });
    });
    this.duration = duration || Infinity;
    this.timeScale = timeScale;
    this.needParse = false;
  }
  /**
   * 是否正在播放
   * @return {boolean}
   */
  public isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * 开始播放
   */
  public play() {
    if (this.needParse) {
      this.parseAnimatorData();
    }
    this._isPlaying = true;
  }

  /**
   * 暂停播放
   *
   */
  public pause() {
    this._isPlaying = false;
    this.animationList.forEach(animation => {
      animation.pause();
    });
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
  }
}
