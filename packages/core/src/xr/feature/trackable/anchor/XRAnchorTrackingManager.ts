import { registerXRFeatureManager } from "../../../XRModule";
import { XRFeatureType } from "../../XRFeatureType";
import { XRFeatureChangeFlag } from "../../XRFeatureChangeFlag";
import { XRTrackableManager } from "../XRTrackableManager";
import { IXRPose, IXRTrackedAnchor } from "@galacean/engine-design";
import { IXRAnchorTrackingDescriptor } from "./IXRAnchorTrackingDescriptor";
import { XRPlatformAnchorTracking } from "./XRPlatformAnchorTracking";

@registerXRFeatureManager(XRFeatureType.AnchorTracking)
export class XRAnchorTrackingManager extends XRTrackableManager<
  IXRAnchorTrackingDescriptor,
  XRPlatformAnchorTracking,
  IXRTrackedAnchor
> {
  addAnchor(pose: IXRPose): void {
    this.platformFeature.addAnchor();
  }

  removeAnchor(id: number): void {
    this.platformFeature.removeAnchor();
  }
}
