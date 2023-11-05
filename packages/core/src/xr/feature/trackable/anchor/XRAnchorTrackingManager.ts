import { registerXRFeatureManager } from "../../../XRModule";
import { XRFeatureType } from "../../XRFeatureType";
import { XRTrackableManager } from "../XRTrackableManager";
import { IXRPose, IXRRequestTrackingAnchor, IXRTrackedAnchor } from "@galacean/engine-design";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRPlatformAnchorTracking } from "./XRPlatformAnchorTracking";

@registerXRFeatureManager(XRFeatureType.AnchorTracking)
export class XRAnchorTrackingManager extends XRTrackableManager<
  IXRAnchorTrackingDescriptor,
  XRPlatformAnchorTracking,
  IXRTrackedAnchor
> {
  addAnchor(pose: IXRPose): void {
    // this._platformFeature.addAnchor(pose);
  }

  removeAnchor(anchor: IXRRequestTrackingAnchor): void {
    // this._platformFeature.removeAnchor(anchor);
  }
}
