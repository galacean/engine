import { IXRRequestTracking, IXRTrackablePlatformFeature, IXRTracked } from "@galacean/engine-design";
import { WebXRFrame } from "../WebXRFrame";
import { WebXRSession } from "../WebXRSession";
import { WebXRFeature } from "./WebXRFeature";

/**
 * @internal
 */
export abstract class WebXRTrackableFeature<T extends IXRTracked, K extends IXRRequestTracking<T>>
  extends WebXRFeature
  implements IXRTrackablePlatformFeature<T, K>
{
  get canModifyRequestTrackingAfterInit(): boolean {
    return false;
  }

  abstract getTrackedResult(session: WebXRSession, frame: WebXRFrame, requestTrackings: K[]): void;

  abstract checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: K[]): boolean;
}
