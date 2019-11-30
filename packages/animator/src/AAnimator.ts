import { NodeAbility, Node } from '@alipay/o3-core'
import { AAnimation } from './AAnimation'

/**
 * Engine Feature：全局动画控制器
 */
export class AAnimator extends NodeAbility {
  state: string
  runTime: number
  startTime: number
  currentTime: number
  _timeScale: number
  _sortedStartTime: boolean
  _startTimeSet: any
  _startTimeQueue: any
  _animSet: any
  _animStartTimeMap: any
  _name: any
  _handlerList: Array<any>

  /**
   * 缩放播放速度
   * @member {number}
   */
  get timeScale(): number {
    return this._timeScale
  }
  /**
   * 设置播放速度
   */
  set timeScale(val: number) {
    if (val > 0) {
      this._timeScale = val
    }
  }

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
    this._animSet = {} // name : Animation
    this._animStartTimeMap = {}
    this._startTimeSet = {} // startTime: Animation
    this._startTimeQueue = []
    this._timeScale = 1.0
    this.currentTime = 0
  }

  /**
   * 添加animClip
   * @param {number} startTime 开始时间
   * @param {Animation} animation 动画片段对象
   */
  public addAnimationByStartTime(startTime: number, animation: AAnimation) {
    const name = animation.name
    this._sortedStartTime = false
    this._startTimeSet[startTime] = this._startTimeSet[startTime] || {}
    this._startTimeSet[startTime][name] = animation
    if (!~this._startTimeQueue.indexOf(startTime)) {
      this._startTimeQueue.push(startTime)
    }
    this._animSet[name] = animation
    this._animStartTimeMap[name] = startTime
  }

  public removeAnimationClip(name: string) {
    const animation = this._animSet[name]
    if (animation) {
      const startTime = this._animStartTimeMap[name]
      this._sortedStartTime = false
      delete this._startTimeSet[startTime][name]
      delete this._animSet[name]
      delete this._animStartTimeMap[name]
      const keyFrameIndex = this._startTimeQueue.indexOf(startTime)
      if (!!~keyFrameIndex) {
        this._startTimeQueue.splice(keyFrameIndex, 1)
      }
    }
  }

  sortKeyFrame() {
    this._startTimeQueue.sort()
    this._sortedStartTime = true
  }

  play(): void {
    if (!this._sortedStartTime) this.sortKeyFrame()
    this.state = 'run'
    this.startTime = new Date().getTime()
  }

  public update(deltaTime: number) {
    if (this.state !== 'run') return
    deltaTime = deltaTime * this._timeScale
    super.update(deltaTime)
    this.currentTime += deltaTime
    Object.keys(this._animSet).forEach(name => {
      const anim = this._animSet[name]
      const animStartTime = this._animStartTimeMap[name]
      if (this.currentTime - animStartTime >= 0 && !anim.isPlaying()) {
        anim.play()
      }
    })
  }
}
