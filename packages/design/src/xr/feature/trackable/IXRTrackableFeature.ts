import { IXRFrame } from "../../IXRFrame";
import { IXRSession } from "../../IXRSession";
import { IXRPlatformFeature } from "../IXRPlatformFeature";
import { IXRRequestTracking } from "./IXRRequestTracking";
import { IXRTracked } from "./IXRTracked";

export interface IXRTrackableFeature<
  TXRTracked extends IXRTracked,
  TXRRequestTracking extends IXRRequestTracking<TXRTracked>
> extends IXRPlatformFeature {
  /**
   * Returns whether request tracking can be modified after initialization.
   */
  get canModifyRequestTrackingAfterInit(): boolean;

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
   * Called when request tracking is added.
   * @param requestTracking - The request tracking
   */
  onAddRequestTracking?(requestTracking: TXRRequestTracking): void;

  /**
   * Called when request tracking is removed.
   * @param requestTracking - The request tracking
   */
  onDeleteRequestTracking?(requestTracking: TXRRequestTracking): void;
}
