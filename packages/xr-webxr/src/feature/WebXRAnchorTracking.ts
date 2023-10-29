import { XRFeatureType, XRPlatformAnchorTracking } from "@galacean/engine";
import { IXRTrackedAnchor } from "@galacean/engine-design";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
export class WebXRAnchorTracking extends XRPlatformAnchorTracking {
  override getChanges(): {
    readonly added: IXRTrackedAnchor[];
    readonly updated: IXRTrackedAnchor[];
    readonly removed: IXRTrackedAnchor[];
  } {
    return null;
  }
}
