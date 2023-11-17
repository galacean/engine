import { Logger, XRFeatureType, XRMovementTrackingMode } from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { IXRFeatureDescriptor, IXRMovementTracking } from "@galacean/engine-design";

@registerXRPlatformFeature(XRFeatureType.MovementTracking)
/**
 * WebXR implementation of XRPlatformMovementTracking.
 */
export class WebXRMovementTracking implements IXRMovementTracking {
  isSupported(descriptor: IXRFeatureDescriptor): Promise<void> {
    return Promise.resolve();
  }

  get trackingMode(): XRMovementTrackingMode {
    return XRMovementTrackingMode.Dof6;
  }

  set trackingMode(value: XRMovementTrackingMode) {
    Logger.warn("WebXR does not support modifying motion tracking mode.");
  }
}
