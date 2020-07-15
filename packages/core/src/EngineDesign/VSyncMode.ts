/**
 * 垂直同步模式。
 */
export enum VSyncMode {
  /** 关闭垂直同步。 */
  None = 0,
  /** 每一个垂直消隐执行一帧。 */
  EveryVBlank = 1,
  /** 每两个垂直消隐执行一帧。 */
  EverySecondVBlank = 2,
  /** 每三个垂直消隐执行一帧。 */
  EveryThirdVBlank = 3,
  /** 每四个垂直消隐执行一帧。 */
  EveryFourthVBlank = 4
}
