import { IXRPlaneTrackingDescriptor } from "./IXRPlaneTrackingDescriptor";
import { XRPlaneMode } from "./XRPlaneMode";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRTrackedPlane } from "./XRTrackedPlane";
import { registerXRFeatureManager } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingPlane } from "./XRRequestTrackingPlane";
import { IXRPlaneTracking } from "@galacean/engine-design";

@registerXRFeatureManager(XRFeatureType.PlaneTracking)
/**
 * The manager of plane tracking feature.
 */
export class XRPlaneTrackingManager extends XRTrackableManager<
  IXRPlaneTrackingDescriptor,
  XRTrackedPlane,
  XRRequestTrackingPlane,
  IXRPlaneTracking
> {
  /**
   * Return the plane detection mode for XR.
   */
  get detectionMode(): XRPlaneMode {
    return this._feature.detectionMode;
  }

  set detectionMode(value: XRPlaneMode) {
    this._feature.detectionMode = value;
  }

  override initialize(): Promise<void> {
    this.addRequestTracking(new XRRequestTrackingPlane(this._descriptor.mode));
    return Promise.resolve();
  }
}
