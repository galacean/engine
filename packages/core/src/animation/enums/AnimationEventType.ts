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
