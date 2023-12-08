import { XRRequestTrackingState } from "./XRRequestTrackingState";
import { XRTracked } from "./XRTracked";

export abstract class XRRequestTracking<T extends XRTracked> {
  /** The status of the current request tracking. */
  state: XRRequestTrackingState = XRRequestTrackingState.None;
  /** Tracked instances, make up from the tracking data returned by Session. */
  tracked: T[] = [];
}
