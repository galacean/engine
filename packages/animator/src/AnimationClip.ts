import { AssetObject } from "@alipay/o3-core";
import { AnimationClipType } from "./AnimationConst";
const { Interpolation, Frame, Skelton, AnimationComponent } = AnimationClipType;

/**
 * Data for an animation, set of Samples and Channels
 * @extends AssetObject
 */
export class AnimationClip extends AssetObject {
  public AnimationClipType: AnimationClipType;
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
   * @param {AnimationClipType} AnimationClipType
   */
  constructor(name: string, AnimationClipType: AnimationClipType, options: any = null) {
    super(name);
    this.AnimationClipType = AnimationClipType || Interpolation;
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
    switch (this.AnimationClipType) {
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
        this.AnimationClipType = AnimationComponent;
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
