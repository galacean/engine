import { IXRPose } from "@galacean/engine-design";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRPlatformAnchorTracking } from "./XRPlatformAnchorTracking";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRRequestTrackingAnchor } from "./XRRequestTrackingAnchor";
import { XRTracked } from "../XRTracked";
import { XRFeatureType } from "../../XRFeatureType";
import { registerXRFeatureManager } from "../../../XRManager";

@registerXRFeatureManager(XRFeatureType.AnchorTracking)
/**
 * The manager of XR anchor tracking.
 */
export class XRAnchorTrackingManager extends XRTrackableManager<
  IXRAnchorTrackingDescriptor,
  XRTracked,
  XRPlatformAnchorTracking
> {
  /**
   * Add a tracking anchor.
   * @param pose - The pose of anchor to be added
   */
  addAnchor(pose: IXRPose): XRRequestTrackingAnchor {
    return this._platformFeature._addAnchor(pose);
  }

  /**
   * Remove a tracking anchor.
   * @param anchor - The anchor to be removed
   */
  removeAnchor(anchor: XRRequestTrackingAnchor): void {
    this._platformFeature._removeAnchor(anchor);
  }
}
