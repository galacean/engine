import { IXRTrackedAnchor } from "@galacean/engine-design";
import { XRTrackablePlatformFeature } from "../XRTrackablePlatformFeature";

export abstract class XRPlatformAnchorTracking extends XRTrackablePlatformFeature<IXRTrackedAnchor> {
  addAnchor() {}
  removeAnchor() {}
}
