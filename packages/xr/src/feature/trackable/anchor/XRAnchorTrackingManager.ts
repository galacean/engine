import { IXRPose, IXRRequestTrackingAnchor, IXRTrackedAnchor } from "@galacean/engine-design";
import { XRFeatureType, registerXRFeatureManager } from "@galacean/engine";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRPlatformAnchorTracking } from "./XRPlatformAnchorTracking";
import { XRTrackableManager } from "../XRTrackableManager";
import { XRAnchor } from "../../../component/trackable/XRAnchor";

@registerXRFeatureManager(XRFeatureType.AnchorTracking)
/**
 * The manager of XR anchor tracking.
 */
export class XRAnchorTrackingManager extends XRTrackableManager<
  IXRAnchorTrackingDescriptor,
  IXRTrackedAnchor,
  XRAnchor,
  XRPlatformAnchorTracking
> {
  /**
   * Add a tracking anchor.
   * @param pose - The pose of anchor to be added
   */
  addAnchor(pose: IXRPose): IXRRequestTrackingAnchor {
    return this._platformFeature._addAnchor(pose);
  }

  /**
   * Remove a tracking anchor.
   * @param anchor - The anchor to be removed
   */
  removeAnchor(anchor: IXRRequestTrackingAnchor): void {
    // this._platformFeature._removeAnchor(anchor);
  }
}
