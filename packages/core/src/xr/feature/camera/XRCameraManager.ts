import { Camera } from "../../../Camera";
import { Engine } from "../../../Engine";
import { Logger } from "../../../base";
import { XRInputType } from "../../input/XRInputType";
import { XRInputManager } from "../../input/XRInputManager";
import { XRCamera } from "../../input/XRCamera";
import { XRFeatureManager } from "../XRFeatureManager";
import { IXRCameraDescriptor } from "./IXRCameraDescriptor";
import { XRPlatformCamera } from "./XRPlatformCamera";
import { registerXRFeatureManager } from "../../XRModule";
import { XRFeatureType } from "../XRFeatureType";
import { XRSessionType } from "../../session/XRSessionType";

@registerXRFeatureManager(XRFeatureType.CameraDevice)
/**
 * The manager of XR camera.
 */
export class XRCameraManager extends XRFeatureManager<IXRCameraDescriptor, XRPlatformCamera> {
  private _inputManager: XRInputManager;

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
   * Get the camera by the specified screen position.
   * @param screenX - The screen x position (normalized)
   * @param screenY - The screen y position (normalized)
   * @returns The camera
   */
  getCameraByScreenPosition(screenX: number, screenY: number): Camera {
    if (this._engine.xrModule.mode === XRSessionType.AR) {
      return this.getCameraByType(XRInputType.Camera);
    } else {
      for (const type of [XRInputType.LeftCamera, XRInputType.RightCamera]) {
        const camera = this._inputManager.getInput<XRCamera>(type).camera;
        if (camera?.viewport) {
          const { x, y, z, w } = camera.viewport;
          if (x <= screenX && x + z >= screenX && y <= screenY && y + w >= screenY) {
            return camera;
          }
        }
      }
    }
  }

  set fixedFoveation(value: number) {
    this._platformFeature.fixedFoveation = value;
  }

  get fixedFoveation() {
    return this._platformFeature.fixedFoveation;
  }

  constructor(engine: Engine) {
    super(engine);
    this._inputManager = engine.xrModule.inputManager;
    this._enabled = true;
  }
}
