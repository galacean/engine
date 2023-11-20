/**
 *  TargetRayMode indicates the method by which the target ray for
 *  the input source should be generated and how it should be presented to the user.
 */
export enum XRTargetRayMode {
  /** Eye */
  Gaze,
  /** Controller */
  TrackedPointer,
  /** Game pad */
  Screen
}
