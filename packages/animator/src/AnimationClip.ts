import { AssetObject, Node } from '@alipay/o3-core'
import { InterpolationType, AnimationType } from './AnimationConst'
import { Value } from './types'
import { Tweener, TweenPlugins, doTransform } from '@alipay/o3-tween'
import { vec2, vec3, vec4, quat } from '@alipay/o3-math'
const { Interpolation, Frame, Skelton, AnimationComponent } = AnimationType

/**
 * Data for an animation, set of Samples and Channels
 * @extends AssetObject
 */
export class AnimationClip extends AssetObject {
  public animationType: AnimationType
  public options: any
  /**
   * Interpolation
   */
  public endValue?: Value
  public affectProperty?: string
  public interpolation?: InterpolationType
  public node: Node
  /**
   * Frame
   */
  public frameIndex?: number
  duration: any
  skeltonAnim: any
  animationComponentAbility: any

  /**
   * @constructor
   * @param {string} name
   * @param {AnimationType} animationType
   */
  constructor(name: string, animationType: AnimationType, options: any) {
    super(name)
    this.animationType = animationType || Interpolation
    this.options = options
    this.initialize()
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
        this.initInterpolation()
        break
      case Frame:
        this.initFrame()
        break
      case Skelton:
        this.initSkelton()
        break
      default:
        this.animationType = AnimationComponent
        this.initAnimationComponent()
        break
    }
  }

  initInterpolation() {
    const { value, property, interpolation, duration } = this.options
    this.endValue = value
    this.affectProperty = property
    this.interpolation = interpolation
    this.duration = duration
  }

  initFrame() {
    const { fps, frameRects } = this.options
  }

  initSkelton() {
    this.skeltonAnim = this.options
  }

  initAnimationComponent() {
    const { script } = this.options
    this.animationComponentAbility = script
  }
}
