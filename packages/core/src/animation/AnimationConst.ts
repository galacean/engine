/**
 * Animation wrap mode.
 * @readonly
 */
export enum WrapMode {
  /** Play once */
  ONCE = 0,
  /** Loop play */
  LOOP = 1
}

/**
 * Animation event type.
 * @readonly
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
 * @readonly
 */
export enum InterpolationType {
  /** Linear interpolation */
  LINEAR,
  /** Cubic spline interpolation */
  CUBICSPLINE,
  /** Stepped interpolation */
  STEP,
  /** Hermite interpolation */
  HERMITE
}
