import { IXRLightEstimationPlatformFeature } from "@galacean/engine-design";
import { registerXRFeature } from "../../XRManagerExtended";
import { XRFeature } from "../XRFeature";
import { XRFeatureType } from "../XRFeatureType";
import { XRLightEstimate } from "./XRLightEstimate";

/**
 * The manager of XR light estimation.
 */
@registerXRFeature(XRFeatureType.LightEstimation)
export class XRLightEstimation extends XRFeature<IXRLightEstimationPlatformFeature> {
  private _estimate: XRLightEstimate = new XRLightEstimate();
  private _available: boolean = false;

  /**
   * The latest light estimation data.
   */
  get estimate(): XRLightEstimate {
    return this._estimate;
  }

  /**
   * Whether the estimate is available in current frame.
   */
  get available(): boolean {
    return this._available;
  }

  /**
   * @internal
   */
  override _onUpdate(): void {
    const { _platformSession: platformSession } = this._xrManager.sessionManager;
    if (!platformSession) {
      this._available = false;
      return;
    }
    const platformFrame = platformSession.frame;
    if (!platformFrame || !this._platformFeature.checkAvailable(platformSession, platformFrame)) {
      this._available = false;
      return;
    }
    this._available = this._platformFeature.getLightEstimate(platformSession, platformFrame, this._estimate);
  }

  /**
   * @internal
   */
  override _onSessionExit(): void {
    this._available = false;
  }
}
