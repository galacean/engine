import { XRInputType } from "./XRInputType";

/**
 * XR interaction events.
 */
export class XRInputEvent {
  /**
   *  TargetRayMode indicates the method by which the target ray for
   *  the input source should be generated and how it should be presented to the user.
   */
  targetRayMode: "gaze" | "tracked-pointer" | "screen";
  /** The type of input event. */
  type: "select" | "selectend" | "selectstart" | "squeeze" | "squeezeend" | "squeezestart";
  /** The type of input. */
  input: XRInputType;
  /** The unique ID of the touch point. (Appears only when targetRayMode is screen.)*/
  id?: number;
  /** The coordinate x on the screen. (Appears only when targetRayMode is screen.)*/
  x?: number;
  /** The coordinate y on the screen. (Appears only when targetRayMode is screen.) */
  y?: number;
}
