import { IXRFeatureDescriptor, IXRPlaneTracking } from "@galacean/engine-design";
import { WebXRSessionManager } from "../session/WebXRSessionManager";
import { EnumXRFeature } from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";

@registerXRPlatformFeature(EnumXRFeature.PlaneTracking)
export class WebXRPlaneTracking implements IXRPlaneTracking {
  descriptor: IXRFeatureDescriptor;

  _initialize(descriptor: IXRFeatureDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      this.descriptor = descriptor;
      resolve();
    });
  }

  _onUpdate(): void {}

  _onDestroy() {}
}
