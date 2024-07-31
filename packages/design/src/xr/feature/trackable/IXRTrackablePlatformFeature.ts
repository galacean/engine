import { IXRFrame } from "../../IXRFrame";
import { IXRSession } from "../../IXRSession";
import { IXRPlatformFeature } from "../IXRPlatformFeature";
import { IXRRequestTracking } from "./IXRRequestTracking";
import { IXRTracked } from "./IXRTracked";

export interface IXRTrackablePlatformFeature<T extends IXRTracked, K extends IXRRequestTracking<T>>
  extends IXRPlatformFeature {
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
  getTrackedResult(session: IXRSession, frame: IXRFrame, requestTrackings: K[], generateTracked: () => T): void;

  /**
   * Check if the feature is available.
   * @param session - The XR session
   * @param frame - The XR frame
   * @param requestTrackings - The request trackings
   */
  checkAvailable(session: IXRSession, frame: IXRFrame, requestTrackings: K[]): boolean;

  /**
   * Called when request tracking is added.
   * @param requestTracking - The request tracking
   */
  onAddRequestTracking(requestTracking: K): void;

  /**
   * Called when request tracking is removed.
   * @param requestTracking - The request tracking
   */
  onDelRequestTracking(requestTracking: K): void;
}
