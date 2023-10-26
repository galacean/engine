import { IXRPlaneTracking } from "@galacean/engine-design";
import {
  EnumXRFeature,
  EnumXRFeatureChangeFlag,
  IXRPlaneTrackingDescriptor,
  registerXRPlatformFeature
} from "@galacean/engine";

@registerXRPlatformFeature(EnumXRFeature.PlaneTracking)
export class WebXRPlaneTracking implements IXRPlaneTracking {
  descriptor: IXRPlaneTrackingDescriptor;

  _initialize(descriptor: IXRPlaneTrackingDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      this.descriptor = descriptor;
      resolve();
    });
  }

  _isSupported(descriptor: IXRPlaneTrackingDescriptor): Promise<void> {
    return new Promise((resolve) => {
      resolve();
    });
  }

  _onFlagChange(flag: EnumXRFeatureChangeFlag, ...param): void {}

  _onUpdate(): void {}

  _onDestroy() {}
}
