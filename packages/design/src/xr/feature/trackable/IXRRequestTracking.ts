import { IXRTracked } from "./IXRTracked";

/**
 * The base interface for request tracking in XR.
 */
export interface IXRRequestTracking<T extends IXRTracked = IXRTracked> {
  /** The status of the current request tracking. */
  state: number;
  /** Tracked instances, make up from the tracking data returned by Session. */
  tracked: T[];
}
