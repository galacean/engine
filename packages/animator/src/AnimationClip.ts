import { AssetObject } from "@alipay/o3-core";
import { InterpolationType, AnimationType } from "./AnimationConst";
import { Value } from "./types";
const { Interpolation, Frame, Skelton, AnimationComponent } = AnimationType;

/**
 * Data for an animation, set of Samples and Channels
 * @extends AssetObject
 */
export class AnimationClip extends AssetObject {
  public animationType: AnimationType;
  public options: any;
  /**
   * Interpolation
   */
  public endValue?: Value = new Float32Array([0, 0, 0]);
  public affectProperty?: string = null;
  public interpolation?: InterpolationType = InterpolationType.LINEAR;
  public duration?: number = null;

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
    console.log(animationType, Interpolation);
    this.animationType = animationType || Interpolation;
    this.options = options;
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
      const { value, property, interpolation, duration } = this.options;
      this.endValue = new Float32Array(value);
      this.affectProperty = property;
      this.interpolation = interpolation;
      this.duration = duration;
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
