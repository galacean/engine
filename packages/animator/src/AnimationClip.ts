import { AssetObject } from "@alipay/o3-core";
import { AnimationType } from "./AnimationConst";
const { Interpolation, Frame, Skelton, AnimationComponent } = AnimationType;

/**
 * Data for an animation, set of Samples and Channels
 * @extends AssetObject
 */
export class AnimationClip extends AssetObject {
  public animationType: AnimationType;
  public _options: any;
  /**
   * Interpolation
   */
  public keyFrames: any;

  /**
   * Frame
   */
  public frameIndex?: number = null;
  /**
   * Skelton
   */
  public skeltonAnim?: any = null;
  /**
   * AnimationComponent
   */
  public animationComponentAbility: any = null;

  /**
   * @constructor
   * @param {string} name
   * @param {AnimationType} animationType
   */
  constructor(name: string, animationType: AnimationType, options: any = null) {
    super(name);
    this.animationType = animationType || Interpolation;
    this.options = options;
    this.initialize();
  }
  get options() {
    return this._options;
  }
  set options(options) {
    this._options = options;
    this.initialize();
  }

  // get startTime() {
  //   return this._startTime
  // }

  // set startTime(time) {
  //   this._startTime = time
  // }

  // public setStartTime(time) {
  //   this._startTime = time
  // }

  initialize() {
    switch (this.animationType) {
      case Interpolation:
        this.initInterpolation();
        break;
      case Frame:
        this.initFrame();
        break;
      case Skelton:
        this.initSkelton();
        break;
      default:
        this.animationType = AnimationComponent;
        this.initAnimationComponent();
        break;
    }
  }

  initInterpolation() {
    if (this.options) {
      const { keyFrames } = this.options;
      this.keyFrames = keyFrames;
    }
  }

  initFrame() {
    const { fps, frameRects } = this.options;
  }

  initSkelton() {
    this.skeltonAnim = this.options;
  }

  initAnimationComponent() {
    const { script } = this.options;
    this.animationComponentAbility = script;
  }
}
