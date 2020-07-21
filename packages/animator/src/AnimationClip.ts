import { AssetObject } from "@alipay/o3-core";
import { AnimationClipType } from "./AnimationConst";
const { Interpolation, Frame, Skeleton, AnimationComponent } = AnimationClipType;

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
  public keyframes: any;

  /**
   * Frame
   */
  public frameIndex?: number = null;
  /**
   * Skeleton
   */
  public skeltonAnim?: any = null;
  /**
   * AnimationComponent
   */
  public animationComponentAbility: any = null;

  public handlerMap: any;

  /**
   * @constructor
   * @param {string} name
   * @param {AnimationClipType} AnimationClipType
   */
  constructor(name: string, AnimationClipType: AnimationClipType, options: any = null) {
    super();
    this.AnimationClipType = AnimationClipType || Interpolation;
    this.options = options;
    this.handlerMap = {};
    this.initialize();
  }
  get options() {
    return this._options;
  }
  set options(options) {
    this._options = options;
    this.initialize();
  }

  initialize() {
    switch (this.AnimationClipType) {
      case Interpolation:
        this.initInterpolation();
        break;
      case Frame:
        this.initFrame();
        break;
      case Skeleton:
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
      const { keyframes } = this.options;
      this.keyframes = keyframes;
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

  addHandler(id, handler) {
    this.handlerMap[id] = handler;
  }

  removeHandler(id) {
    if (this.handlerMap[id]) {
      this.handlerMap[id].stop();
      delete this.handlerMap[id];
    }
  }

  removeAllHandler() {
    Object.keys(this.handlerMap).forEach((id) => {
      this.removeHandler(id);
    });
  }
}
