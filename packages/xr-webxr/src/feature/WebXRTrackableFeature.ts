import { IXRRequestTracking, IXRTrackablePlatformFeature, IXRTracked } from "@galacean/engine-design";
import { XRRequestTrackingState } from "@galacean/engine-xr";
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

  abstract getTrackedResult(
    session: WebXRSession,
    frame: WebXRFrame,
    requestTrackings: K[],
    generateTracked: () => T
  ): void;

  abstract checkAvailable(session: WebXRSession, frame: WebXRFrame, requestTrackings: K[]): boolean;

  onAddRequestTracking(requestTracking: K): void {}

  onDelRequestTracking(requestTracking: K): void {
    requestTracking.state = XRRequestTrackingState.Destroyed;
  }
}
