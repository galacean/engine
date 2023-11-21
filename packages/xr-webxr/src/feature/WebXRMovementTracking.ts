import { IXRMovementTrackingConfig, IXRMovementTracking } from "@galacean/engine-design";
import { registerXRPlatformFeature } from "../WebXRDevice";

// XRFeatureType.MovementTracking
@registerXRPlatformFeature(0)
/**
 * WebXR implementation of XRPlatformMovementTracking.
 */
export class WebXRMovementTracking implements IXRMovementTracking {
  isSupported(config: IXRMovementTrackingConfig): Promise<void> {
    return Promise.resolve();
  }

  get trackingMode(): number {
    // XRMovementTrackingMode.Dof6
    return 2;
  }

  set trackingMode(value: number) {
    console.warn("WebXR does not support modifying motion tracking mode.");
  }
}
