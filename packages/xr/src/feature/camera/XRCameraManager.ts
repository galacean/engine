import {
  Camera,
  Engine,
  Logger,
  XRCamera,
  XRFeatureManager,
  XRFeatureType,
  XRInputManager,
  XRInputType,
  XRSessionManager,
  registerXRFeatureManager
} from "@galacean/engine";
import { IXRCameraDescriptor } from "./IXRCameraDescriptor";

@registerXRFeatureManager(XRFeatureType.CameraDevice)
/**
 * The manager of XR camera.
 */
export class XRCameraManager extends XRFeatureManager<IXRCameraDescriptor> {
  private _inputManager: XRInputManager;
  private _sessionManager: XRSessionManager;

  override get enabled() {
    return true;
  }

  override set enabled(value: boolean) {
    Logger.warn("XRCameraManager.enabled is always true and cannot be changed.");
  }

  /**
   * Attach the camera to the specified input type.
   * @param type - The input type
   * @param camera - The camera to be attached
   */
  attachCamera(type: XRInputType, camera: Camera): void {
    const xrViewer = this._inputManager.getInput<XRCamera>(type);
    if (xrViewer) {
      xrViewer.camera = camera;
    } else {
      Logger.warn(XRInputType[type], "not a legal input type.");
    }
  }

  /**
   * Detach the camera from the specified input type.
   * @param type - The input type
   * @returns The camera that was detached
   */
  detachCamera(type: XRInputType): Camera {
    const xrViewer = this._inputManager.getInput<XRCamera>(type);
    const preCamera = xrViewer.camera;
    xrViewer.camera = null;
    return preCamera;
  }

  /**
   * Get the camera by the specified input type.
   * @param type - The input type
   * @returns The camera
   */
  getCameraByType(type: XRInputType): Camera {
    return this._inputManager.getInput<XRCamera>(type).camera;
  }

  /**
   * Return fixed foveation of the camera.
   */
  get fixedFoveation() {
    const { session } = this._sessionManager;
    if (session) {
      return session.fixedFoveation;
    } else {
      return 1;
    }
  }

  set fixedFoveation(value: number) {
    const { session } = this._sessionManager;
    if (session) {
      session.fixedFoveation = value;
    }
  }

  constructor(engine: Engine) {
    super(engine);
    const { xrManager } = engine;
    this._inputManager = xrManager.inputManager;
    this._sessionManager = xrManager.sessionManager;
    this._enabled = true;
  }
}
