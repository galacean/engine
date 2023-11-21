import { IXRPlatformFeature } from "../IXRPlatformFeature";
import { IXRTracked } from "./IXRTracked";
import { IXRSession } from "../../IXRSession";
import { IXRFrame } from "../../IXRFrame";
import { IXRRequestTracking } from "./IXRRequestTracking";

export interface IXRTrackableFeature<
  TXRTracked extends IXRTracked,
  TXRRequestTracking extends IXRRequestTracking<TXRTracked>
> extends IXRPlatformFeature {
  /**
   * Initialize the feature.
   * @param descriptor - The descriptor of the feature
   */
  initialize(requestTrackings: TXRRequestTracking[]): Promise<void>;

  /**
   * Get the tracked result.
   * @param session - The XR session
   * @param frame - The XR frame
   * @param requestTrackings - The request trackings
   */
  getTrackedResult(session: IXRSession, frame: IXRFrame, requestTrackings: TXRRequestTracking[]): void;

  /**
   * Check if the feature is available.
   * @param session - The XR session
   * @param frame - The XR frame
   * @param requestTrackings - The request trackings
   */
  checkAvailable(session: IXRSession, frame: IXRFrame, requestTrackings: TXRRequestTracking[]): boolean;

  /**
   * Add a request tracking.
   * @param requestTracking - The request tracking
   */
  addRequestTracking?(requestTracking: TXRRequestTracking): void;

  /**
   * Delete a request tracking.
   * @param requestTracking - The request tracking
   */
  delRequestTracking?(requestTracking: TXRRequestTracking): void;
}
