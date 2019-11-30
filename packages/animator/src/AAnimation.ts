import { Logger } from '@alipay/o3-base'
import { NodeAbility, Node } from '@alipay/o3-core'
import { AAnimation as SkeltonAnimation } from '@alipay/o3-animation'
import { AnimationClip } from './AnimationClip'
import { quat } from '@alipay/o3-math'
import { AnimationOptions, List } from './types'
import { AnimationType } from './AnimationConst'
import { Tweener, doTransform } from '@alipay/o3-tween'
const { Interpolation, Frame, Skelton, AnimationComponent } = AnimationType

/**
 * 播放动画片段，动画片段所引用的对象必须是此组件的 Node 及其子节点
 * @extends NodeAbility
 * @see class AnimationClip
 */
export class AAnimation extends NodeAbility {
  /**
   * 当前播放时间
   */
  public currentTime: number
  private _isPlaying: boolean
  private _animClipSet
  private _startTimeSet
  private _startTimeQueue: Array<number>
  private _name: string
  private _sortedStartTime: boolean
  private _animClipStartTimeMap: any
  private _handlerList: Array<any>
  private _handlerMap: any

  get name() {
    return this._name
  }

  /**
   * @constructor
   * @param {Node} node
   */
  constructor(node: Node, props: any) {
    super(node)
    this._name = props.name || ''
    this._animClipSet = {} // name : AnimationClip
    this._animClipStartTimeMap = {}
    this._startTimeSet = {} // startTime: AnimationClip
    this._startTimeQueue = []
    this._handlerList = []
    this._handlerMap = {}
    this.currentTime = 0
  }

  /**
   * 动画更新计算
   * @param {number} deltaTime
   * @private
   */
  public update(deltaTime: number) {
    if (!this._isPlaying) return
    super.update(deltaTime)
    this.currentTime += deltaTime
    this.checkNeedBindHandlers()
    this._handlerList.forEach(handler => {
      const { type } = handler
      switch (type) {
        case Interpolation:
          this.updateInterpolation(handler, deltaTime)
          break
        case Skelton:
          this.updateSkeltonAnim(handler)
          break
        case AnimationComponent:
          this.updateAnimationComponent(handler, deltaTime)
          break
      }
    })
  }
  checkNeedBindHandlers() {
    Object.keys(this._animClipSet).forEach(animClipName => {
      const animClip = this._animClipSet[animClipName]
      const animClipStartTimes = this._animClipStartTimeMap[animClipName]
      animClipStartTimes.forEach(startTime => {
        const animClipTime = this.currentTime - startTime
        const hasBind = this._handlerMap[animClipName] && this._handlerMap[animClipName][startTime]
        if (animClipTime >= 0 && !hasBind) {
          const handler = this.bindAnimClip(animClip)
          this._handlerMap[animClipName] = {
            [startTime]: handler
          }
        }
      })
    })
  }

  updateInterpolation(handler, deltaTime) {
    const { _handler, targetValue } = handler
    _handler.update(deltaTime)
    for (let key in targetValue) {
      this.node[key] = targetValue[key]
    }
  }

  updateSkeltonAnim(handler) {
    const { animClip, _handler } = handler
    if (handler.targetValue) return
    _handler.playAnimationClip(animClip.skeltonAnim.name)
    handler.targetValue = true
  }

  updateAnimationComponent(handler, deltaTime) {
    const { _handler } = handler
    if (_handler.animUpdate) {
      _handler.animUpdate(deltaTime)
    }
  }

  bindAnimClip(animClip) {
    switch (animClip.animationType) {
      case Interpolation:
        return this.bindInterpolationAnimClip(animClip)
      case Skelton:
        return this.bindSkeltonAnimClip(animClip)
      case AnimationComponent:
        return this.bindAnimationComponentAnimClip(animClip)
    }
  }

  bindInterpolationAnimClip(animClip) {
    const { Translate, Rotate, Scale, DataType } = doTransform
    const { endValue, affectProperty, duration, interpolation } = animClip
    let targetValue = {}
    //TODO deep clone
    targetValue[affectProperty] = JSON.parse(JSON.stringify(this.node[affectProperty]))
    let tweener = null
    switch (affectProperty) {
      case 'position':
        tweener = Translate(targetValue, endValue, duration, {
          easing: interpolation
        })
        break
      case 'rotate':
        tweener = Rotate(targetValue, endValue, duration, {
          easing: interpolation
        })
        break
      case 'scale':
        tweener = Scale(targetValue, endValue, duration, {
          easing: interpolation
        })
        break
      default:
        if (targetValue.hasOwnProperty(affectProperty)) {
          const startValue = targetValue[affectProperty]
          tweener = DataType(
            startValue,
            value => {
              targetValue[affectProperty] = value
            },
            endValue,
            duration,
            {
              easing: interpolation
            }
          )
        }
    }
    tweener.start(false)
    const handler = {
      type: Interpolation,
      _handler: tweener,
      targetValue,
      animClip,
      _lastFrameTime: 0
    }
    this._handlerList.push(handler)
    return handler
  }

  bindSkeltonAnimClip(animClip) {
    const skeltoAnimationRenderer =
      this.node.findAbilityByType(SkeltonAnimation) || this.node.createAbility(SkeltonAnimation)
    skeltoAnimationRenderer.addAnimationClip(animClip.skeltonAnim, animClip.skeltonAnim.name)
    const handler = {
      type: Skelton,
      _handler: skeltoAnimationRenderer,
      targetValue: false, // skelton clip is playing
      animClip,
      _lastFrameTime: 0
    }
    this._handlerList.push(handler)
    return handler
  }

  bindAnimationComponentAnimClip(animClip) {
    const { animationComponentAbility } = animClip
    const { params } = animClip.options
    const animationComponent = this.node.createAbility(animationComponentAbility, params)
    const handler = {
      type: AnimationComponent,
      _handler: animationComponent,
      targetValue: null,
      animClip,
      _lastFrameTime: 0
    }
    this._handlerList.push(handler)
    return handler
  }

  /**
   * 添加animClip
   * @param {number} startTime 开始时间
   * @param {AnimationClip} animClip 动画片段对象
   */
  public addAnimationClip(startTime: number, animClip: AnimationClip) {
    const name = animClip.name
    this._sortedStartTime = false
    this._startTimeSet[startTime] = this._startTimeSet[startTime] || {}
    this._startTimeSet[startTime][name] = animClip
    if (!~this._startTimeQueue.indexOf(startTime)) {
      this._startTimeQueue.push(startTime)
    }
    this._animClipSet[name] = animClip
    this._animClipStartTimeMap[name] = this._animClipStartTimeMap[name] || []
    this._animClipStartTimeMap[name].push(startTime)
  }

  /**
   * 移除一个animClip
   * @param {string} name 动画片段的名称
   */
  public removeAnimationClip(name: string) {
    const animClip = this._animClipSet[name]
    if (animClip) {
      const startTimes = this._animClipStartTimeMap[name]
      this._sortedStartTime = false
      delete this._animClipSet[name]
      startTimes.forEach(startTime => {
        delete this._startTimeSet[startTime][name]
        const keyFrameIndex = this._startTimeQueue.indexOf(startTime)
        if (!!~keyFrameIndex) {
          this._startTimeQueue.splice(keyFrameIndex, 1)
        }
      })
      delete this._animClipStartTimeMap[name]
    }
  }

  sortKeyFrame() {
    this._startTimeQueue.sort()
    this._sortedStartTime = true
  }

  /**
   * 取得指定的 AnimationClip 的时间长度
   * @param {string} name 动画片段的名称
   * @return {number}
   */
  public getAnimationClipLength(name: string): number {
    // const animClip = this._animClipSet[name]
    // if (animClip) {
    //   return animClip.getChannelTimeLength(0)
    // } else {
    //   return 0.0
    // }
  }

  /**
   * 是否正在播放
   * @return {boolean}
   */
  public isPlaying(): boolean {
    return this._isPlaying
  }

  /**
   * 播放动画
   * @param {String} name 动画片段的名称
   * @param {AnimationOptions} options 动画参数
   */
  public playAnimationClip(name: string, options: AnimationOptions) {}

  /**
   * 开始播放
   */
  public play() {
    if (!this._sortedStartTime) this.sortKeyFrame()
    this._isPlaying = true

    // for (let i = this._animLayers.length - 1; i >= 0; i--) {
    //   if (this._animLayers[i].isFading) {
    //     this._animLayers.splice(i, 1)
    //   } else {
    //     this._animLayers[i].stop(rightnow)
    //   }
    // }
  }

  /**
   * 停止播放
   *
   */
  public stop(rightnow: boolean) {
    this._isPlaying = false
    // for (let i = this._animLayers.length - 1; i >= 0; i--) {
    //   if (this._animLayers[i].isFading) {
    //     this._animLayers.splice(i, 1)
    //   } else {
    //     this._animLayers[i].stop(rightnow)
    //   }
    // }
  }

  /**
   * 跳转到动画的某一帧，立刻生效
   * @param {float} frameTime
   */
  public jumpToFrame(frameTime: number) {
    // frameTime = frameTime / 1000
    // for (let i = this._animLayers.length - 1; i >= 0; i--) {
    //   this._animLayers[i].jumpToFrame(frameTime)
    // }
    // this._updateValues()
  }
}
