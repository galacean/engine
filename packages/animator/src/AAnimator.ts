import { NodeAbility, Node } from "@alipay/o3-core";
import { AAnimation } from "./AAnimation";

/**
 * Engine Feature：全局动画控制器
 */
export class AAnimator extends NodeAbility {
  state: string;
  runTime: number;
  startTime: number;
  currentTime: number;
  _timeScale: number;
  startTimeAnimationMap: any;
  _name: any;
  _handlerList: Array<any>;
  _animatorData: any;

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

  set animatorData(animatorData) {
    const { options: { keyFrames = {} } = {} } = animatorData;
    console.log("AAnimator animatorData", animatorData, keyFrames);
    Object.keys(keyFrames).forEach(startTime => {
      const keyFramesList = keyFrames[startTime];
      keyFramesList.forEach(keyFrame => {
        this.addAnimationByStartTime(Number(startTime), keyFrame);
      });
    });
    this._animatorData = animatorData;
    console.log(this.startTimeAnimationMap);
    this.play();
  }

  /**
   * @constructor
   * @param {Node} node
   */
  constructor(node: Node, props: any) {
    super(node);
    console.log("AAnimator", node, props);
    const { animatorData } = props;
    this.startTimeAnimationMap = {}; // startTime: AnimationList
    this._timeScale = 1.0;
    this.currentTime = 0;
    this.animatorData = animatorData;
  }

  /**
   * 添加animClip
   * @param {number} startTime 开始时间
   * @param {Animation} animation 动画片段对象
   */
  public addAnimationByStartTime(startTime: number, animation: AAnimation) {
    this.startTimeAnimationMap[startTime] = this.startTimeAnimationMap[startTime] || [];
    this.startTimeAnimationMap[startTime].push(animation);
  }

  play(): void {
    this.state = "run";
    this.startTime = new Date().getTime();
  }

  public update(deltaTime: number) {
    if (this.state !== "run") return;
    deltaTime = deltaTime * this._timeScale;
    super.update(deltaTime);
    this.currentTime += deltaTime;
    Object.keys(this.startTimeAnimationMap).forEach(startTime => {
      if (this.currentTime - Number(startTime) >= 0) {
        const animationList = this.startTimeAnimationMap[startTime];
        animationList.forEach(animation => {
          console.log(animation.isPlaying());
          if (!animation.isPlaying()) {
            animation.play();
          }
        });
      }
    });
  }
}
