import { Logger, XRFeatureType } from "@galacean/engine";
import { XRMovementTrackingMode, XRPlatformMovementTracking } from "@galacean/engine-xr";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(XRFeatureType.MovementTracking)
/**
 * WebXR implementation of XRPlatformMovementTracking.
 */
export class WebXRMovementTracking extends XRPlatformMovementTracking {
  /**
   * Return the movement tracking mode for WebXR, which is Dof6 (Six Degrees of Freedom).
   */
  override get trackingMode(): XRMovementTrackingMode {
    return XRMovementTrackingMode.Dof6;
  }

  override set trackingMode(value: XRMovementTrackingMode) {
    Logger.warn("WebXR does not support modifying motion tracking mode.");
  }
}
