import { IXRFrame } from "../../IXRFrame";
import { IXRSession } from "../../IXRSession";
import { IXRPlatformFeature } from "../IXRPlatformFeature";
import { IXRRequestTracking } from "./IXRRequestTracking";

export interface IXRTrackablePlatformFeature extends IXRPlatformFeature {
  /**
   * Returns whether request tracking can be modified after initialization.
   */
  get canModifyRequestTrackingAfterInit(): boolean;

  /**
   * Get the tracked result.
   * @param session - The XR session
   * @param frame - The XR frame
   * @param requestTrackings - The request trackings
   */
  getTrackedResult(session: IXRSession, frame: IXRFrame, requestTrackings: IXRRequestTracking[]): void;

  /**
   * Check if the feature is available.
   * @param session - The XR session
   * @param frame - The XR frame
   * @param requestTrackings - The request trackings
   */
  checkAvailable(session: IXRSession, frame: IXRFrame, requestTrackings: IXRRequestTracking[]): boolean;

  /**
   * Called when request tracking is added.
   * @param requestTracking - The request tracking
   */
  onAddRequestTracking?(requestTracking: IXRRequestTracking): void;

  /**
   * Called when request tracking is removed.
   * @param requestTracking - The request tracking
   */
  onDelRequestTracking?(requestTracking: IXRRequestTracking): void;
}
