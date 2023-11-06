import { Engine, Logger, XRFeatureType, XRPlatformCamera } from "@galacean/engine";
import { registerXRPlatformFeature } from "../WebXRDevice";
import { WebXRInputManager } from "../WebXRInputManager";
import { WebXRSessionManager } from "../WebXRSessionManager";

@registerXRPlatformFeature(XRFeatureType.CameraDevice)
/**
 * WebXR implementation of XRPlatformCamera.
 */
export class WebXRCameraDevice extends XRPlatformCamera {
  private _sessionManager: WebXRSessionManager;

  override get fixedFoveation(): number {
    const { _platformLayer } = this._sessionManager;
    if (!_platformLayer) {
      Logger.warn("No WebGLLayer available");
      return 1;
    } else {
      return _platformLayer.fixedFoveation;
    }
  }

  override set fixedFoveation(value: number) {
    const { _platformLayer: platformLayer } = this._sessionManager;
    if (!platformLayer) {
      Logger.warn("No WebGLLayer available");
    } else {
      platformLayer.fixedFoveation = value;
    }
  }

  constructor(engine: Engine) {
    super(engine);
    this._sessionManager = <WebXRSessionManager>engine.xrModule.sessionManager;
  }
}
