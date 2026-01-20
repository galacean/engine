import { IXRLightEstimate, IXRLightEstimationPlatformFeature } from "@galacean/engine-design";
import { XRFeatureType } from "@galacean/engine-xr";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRFrame } from "../WebXRFrame";
import { WebXRSession } from "../WebXRSession";
import { WebXRFeature } from "./WebXRFeature";

/**
 * WebXR implementation of light estimation.
 */
@registerXRPlatformFeature(XRFeatureType.LightEstimation)
export class WebXRLightEstimation extends WebXRFeature implements IXRLightEstimationPlatformFeature {
  private _lightProbe: XRLightProbe | null = null;
  private _probeRequestInFlight = false;
  private _probeRequestFailed = false;

  checkAvailable(session: WebXRSession, frame: WebXRFrame): boolean {
    if (!frame._platformFrame) {
      return false;
    }
    if (this._lightProbe) {
      return true;
    }
    if (!this._probeRequestInFlight && !this._probeRequestFailed && session._platformSession.requestLightProbe) {
      this._probeRequestInFlight = true;
      session._platformSession
        .requestLightProbe()
        .then((probe: XRLightProbe) => {
          this._lightProbe = probe;
        })
        .catch((error: unknown) => {
          this._probeRequestFailed = true;
          console.warn("WebXR light estimation requestLightProbe failed.", error);
        })
        .finally(() => {
          this._probeRequestInFlight = false;
        });
    }
    return false;
  }

  getLightEstimate(_session: WebXRSession, frame: WebXRFrame, estimate: IXRLightEstimate): boolean {
    if (!this._lightProbe) {
      return false;
    }
    const platformEstimate = frame._platformFrame.getLightEstimate(this._lightProbe);
    if (!platformEstimate) {
      return false;
    }
    let updated = false;
    const coefficients = platformEstimate.sphericalHarmonicsCoefficients;
    if (coefficients && coefficients.length >= 27) {
      estimate.sphericalHarmonics.copyFromArray(coefficients);
      updated = true;
    }
    const direction = platformEstimate.primaryLightDirection;
    if (direction) {
      estimate.primaryLightDirection.set(direction.x, direction.y, direction.z);
      updated = true;
    }
    const intensity = platformEstimate.primaryLightIntensity;
    if (intensity) {
      estimate.primaryLightIntensity.set(intensity.x, intensity.y, intensity.z, 1);
      updated = true;
    }
    return updated;
  }

  _assembleOptions(options: XRSessionInit): void {
    options.optionalFeatures.push("light-estimation");
  }
}
