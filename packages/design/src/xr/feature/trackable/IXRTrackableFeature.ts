import { IXRFeature } from "../IXRFeature";
import { IXRTracked } from "./IXRTracked";
import { IXRSession } from "../../IXRSession";
import { IXRFrame } from "../../IXRFrame";
import { IXRRequestTracking } from "./IXRRequestTracking";

export interface IXRTrackableFeature<
  TXRTracked extends IXRTracked,
  TXRRequestTracking extends IXRRequestTracking<TXRTracked>
> extends IXRFeature {
  /**
   * Initialize the feature.
   * @param descriptor - The descriptor of the feature
   */
  initialize(requestTrackings: TXRRequestTracking[]): Promise<void>;

  getTrackedResult(session: IXRSession, frame: IXRFrame, requestTrackings: TXRRequestTracking[]): void;

  checkAvailable(session: IXRSession, frame: IXRFrame, requestTrackings: TXRRequestTracking[]): boolean;

  addRequestTracking?(add: TXRRequestTracking): void;

  removeRequestTracking?(remove: TXRRequestTracking): void;
}
