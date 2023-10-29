import { XRFeatureType, XRPlatformFeature } from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(XRFeatureType.PlaneTracking)
export class WebXRAnchorTracking extends XRPlatformFeature {
  _onUpdate(): void {
    
  }
}
