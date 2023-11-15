import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";
import { XRPlaneMode } from "./XRPlaneMode";
import { IXRPlaneTrackingDescriptor } from "./IXRPlaneTrackingDescriptor";
import { XRRequestTrackingPlane } from "./XRRequestTrackingPlane";
import { XRTrackedPlane } from "./XRTrackedPlane";

/**
 * The base class of XR plane tracking.
 */
export abstract class XRPlatformPlaneTracking extends XRTrackablePlatformFeature<
  XRTrackedPlane,
  XRRequestTrackingPlane
> {
  protected _trackingMode: XRPlaneMode = XRPlaneMode.EveryThing;

  override _initialize(descriptor: IXRPlaneTrackingDescriptor): Promise<void> {
    const mode = (this.trackingMode = descriptor.mode);
    const requestTracking = new XRRequestTrackingPlane(mode);
    this.addRequestTracking(requestTracking);
    return Promise.resolve();
  }

  get trackingMode(): XRPlaneMode {
    return this._trackingMode;
  }

  set trackingMode(value: XRPlaneMode) {
    this._trackingMode = value;
  }
}
