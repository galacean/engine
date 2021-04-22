/**
 * Animation wrap mode.
 */
export enum WrapMode {
  /** Play once */
  ONCE = 0,
  /** Loop play */
  LOOP = 1
  // FOREVER: 2,
  // PINGPONG: 3
}

/**
 * Animation event type.
 */
export enum AnimationEventType {
  /** Triggered when the animation over if the wrapMode === WrapMode.ONCE */
  FINISHED = 0,
  /** Triggered when the animation over if the wrapMode === WrapMode.LOOP */
  LOOP_END = 1,
  /** Triggered when the animation plays to the frame */
  FRAME_EVENT = 2
}

/**
 * Animation interpolation method.
 */
export enum InterpolationType {
  /** Linear interpolation */
  LINEAR = 0,
  /** Cubic spline interpolation */
  CUBICSPLINE = 1,
  /** Stepped interpolation */
  STEP = 2
}
