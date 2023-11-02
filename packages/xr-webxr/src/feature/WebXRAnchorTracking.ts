import { XRFeatureType, XRPlatformAnchorTracking } from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
export class WebXRAnchorTracking extends XRPlatformAnchorTracking {}
