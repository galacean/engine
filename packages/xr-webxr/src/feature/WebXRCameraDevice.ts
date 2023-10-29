import { Engine, XRFeatureType, XRPlatformAnchorTracking, XRPlatformCamera, XRPlatformFeature } from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRInputManager } from "../WebXRInputManager";
import { WebXRSessionManager } from "../WebXRSessionManager";

@registerXRPlatformFeature(XRFeatureType.CameraDevice)
export class WebXRAnchorTracking extends XRPlatformAnchorTracking {
  private _inputManager: WebXRInputManager;
  private _sessionManager: WebXRSessionManager;

  constructor(engine: Engine) {
    super(engine);
    const { xrModule } = engine;
    this._inputManager = <WebXRInputManager>xrModule.inputManager;
    this._sessionManager = <WebXRSessionManager>xrModule.sessionManager;
  }
}
