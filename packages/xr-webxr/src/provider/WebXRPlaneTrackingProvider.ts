import { EnumXRFeature, registerXRProvider } from "@galacean/engine";
import { WebXRSession } from "../WebXRSession";
import { IXRFeatureProvider } from "@galacean/engine-design";

@registerXRProvider(EnumXRFeature.PlaneTracking)
export class WebXRPlaneTrackingProvider implements IXRFeatureProvider {
  private _session: WebXRSession;

  attach(session: WebXRSession): void {
    this._session = session;
  }

  onXRFrame(): void {
    const { _platformFrame: platformFrame } = this._session;
    const detectedPlanes = platformFrame.worldInformation.detectedPlanes;
  }

  detach(): void {}

  destroy(): void {}
}
