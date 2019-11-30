/**
 * 动画循环播放模式
 * @readonly
 */
export enum WrapMode {
  /** 只播放一次 */
  ONCE = 0,
  /** 循环播放 */
  LOOP = 1
  // FOREVER: 2,
  // PINGPONG: 3
}

/**
 * 动画事件类型
 * @readonly
 */
export enum AnimationEvent {
  /** 播放模式为 WrapMode.ONCE，结束后触发 */
  FINISHED = 0,
  /** 播放模式为 WrapMode.LOOP，每次循环结束后触发 */
  LOOP_END = 1,
  /** 动画播放到距离开始的某个时间点后，触发的事件 */
  FRAME_EVENT = 2
}

/**
 * 动画插值方式
 * @readonly
 */
export enum InterpolationType {
  /** 线性插值 */
  LINEAR = 0,
  /** 三次贝塞尔曲线插值 */
  CUBICSPLINE = 1,
  /** 步进插值 */
  STEP = 2
}

/**
 * 动画类型
 * @readonly
 */
export enum AnimationType {
  /** 插值动画 */
  Interpolation = 0,
  Frame = 1,
  Skelton = 2,
  AnimationComponent = 3
}
