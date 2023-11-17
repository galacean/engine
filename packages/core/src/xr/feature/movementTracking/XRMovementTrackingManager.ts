import { IXRMovementTrackingDescriptor } from "./IXRMovementTrackingDescriptor";
import { XRMovementTrackingMode } from "./XRMovementTrackingMode";
import { registerXRFeatureManager } from "../../XRManager";
import { XRFeatureType } from "../XRFeatureType";
import { XRFeatureManager } from "../XRFeatureManager";
import { IXRMovementTracking } from "@galacean/engine-design";

@registerXRFeatureManager(XRFeatureType.MovementTracking)
/**
 * The manager of XR movement tracking.
 */
export class XRMovementTrackingManager extends XRFeatureManager<IXRMovementTrackingDescriptor, IXRMovementTracking> {
  get trackingMode(): XRMovementTrackingMode {
    return this._feature.trackingMode;
  }

  set trackingMode(value: XRMovementTrackingMode) {
    this._feature.trackingMode = value;
  }
}
