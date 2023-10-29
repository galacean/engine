import { IXRTrackedAnchor } from "@galacean/engine-design";
import { XRTrackableFeature } from "../XRTrackableFeature";

export abstract class XRPlatformAnchorTracking extends XRTrackableFeature<IXRTrackedAnchor> {
  addAnchor() {}
  removeAnchor() {}
}
