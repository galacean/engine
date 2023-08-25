import { EnumXRFeature, XRFeatureProvider, registerXRProvider } from "@galacean/engine";
import { WebXRSession } from "../WebXRSession";

@registerXRProvider(EnumXRFeature.PlaneTracking)
export class WebXRPlaneTrackingProvider extends XRFeatureProvider {
  onXRFrame(): void {
    const { _platformFrame: platformFrame } = <WebXRSession>this._session;
    const { detectedPlanes } = platformFrame.worldInformation;
  }
}
