/**
 * Animation event type.
 */
export enum AnimationEventType {
  /** Triggered when the animation over if the wrapMode === WrapMode.ONCE */
  Finished = 0,
  /** Triggered when the animation over if the wrapMode === WrapMode.LOOP */
  LoopEnd = 1,
  /** Triggered when the animation plays to the frame */
  FrameEvent = 2
}
