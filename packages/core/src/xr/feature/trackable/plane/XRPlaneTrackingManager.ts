import {
  IXRPlaneTracking,
  IXRPlaneTrackingDescriptor,
  IXRRequestPlaneTracking,
  IXRTrackedPlane
} from "@galacean/engine-design";
import { XRPlaneMode } from "./XRPlaneMode";
import { XRTrackableManager } from "../XRTrackableManager";
import { registerXRFeatureManager } from "../../../XRManager";
import { XRFeatureType } from "../../XRFeatureType";
import { XRRequestTrackingState } from "../XRRequestTrackingState";

@registerXRFeatureManager(XRFeatureType.PlaneTracking)
/**
 * The manager of plane tracking feature.
 */
export class XRPlaneTrackingManager extends XRTrackableManager<
  IXRPlaneTrackingDescriptor,
  IXRTrackedPlane,
  IXRRequestPlaneTracking,
  IXRPlaneTracking
> {
  /**
   * Return the plane detection mode for XR.
   */
  get detectionMode(): XRPlaneMode {
    return this._platformFeature.detectionMode;
  }

  set detectionMode(value: XRPlaneMode) {
    this._platformFeature.detectionMode = value;
  }

  override initialize(): Promise<void> {
    this.addRequestTracking({
      detectionMode: this._descriptor.mode,
      state: XRRequestTrackingState.None,
      tracked: []
    });
    return Promise.resolve();
  }
}
