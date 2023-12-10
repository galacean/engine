import { IXRInputEvent } from "@galacean/engine-design";
import { XRInputEventType } from "./XRInputEventType";
import { XRTargetRayMode } from "./XRTargetRayMode";
import { XRTrackedInputDevice } from "./XRTrackedInputDevice";

/**
 * XR interaction events.
 */
export class XRInputEvent implements IXRInputEvent {
  /**
   *  TargetRayMode indicates the method by which the target ray for
   *  the input source should be generated and how it should be presented to the user.
   */
  targetRayMode: XRTargetRayMode;
  /** The type of input event. */
  type: XRInputEventType;
  /** The type of input. */
  input: XRTrackedInputDevice;
  /** The unique ID of the touch point. (Appears only when targetRayMode is screen.)*/
  id?: number;
  /** The coordinate x on the screen. (Appears only when targetRayMode is screen.)*/
  x?: number;
  /** The coordinate y on the screen. (Appears only when targetRayMode is screen.) */
  y?: number;
}
