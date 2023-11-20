import { IXRSession, IXRFrame } from "@galacean/engine-design";
import { Matrix } from "@galacean/engine-math";
import { Camera } from "../../../Camera";
import { Engine } from "../../../Engine";
import { Logger } from "../../../base";
import { registerXRFeatureManager } from "../../XRManager";
import { XRCamera } from "../../input/XRCamera";
import { XRInputManager } from "../../input/XRInputManager";
import { XRInputType } from "../../input/XRInputType";
import { XRSessionManager } from "../../session/XRSessionManager";
import { XRFeatureManager } from "../XRFeatureManager";
import { XRFeatureType } from "../XRFeatureType";

@registerXRFeatureManager(XRFeatureType.CameraDevice)
/**
 * The manager of XR camera.
 */
export class XRCameraManager extends XRFeatureManager {
  private _inputManager: XRInputManager;
  private _sessionManager: XRSessionManager;

  override get enabled() {
    return true;
  }

  override set enabled(value: boolean) {
    Logger.warn("XRCameraManager.enabled is always true and cannot be changed.");
  }

  /**
   * Attach the camera to the specified input type(Camera, LeftCamera or RightCamera).
   * Once the attached is set up, the camera entity will be automatically moved to the XROrigin entity.
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
  get fixedFoveation(): number {
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

  override onUpdate(session: IXRSession, frame: IXRFrame): void {
    const { _cameras: cameras } = this._inputManager;
    for (let i = 0, n = cameras.length; i < n; i++) {
      const cameraDevice = cameras[i];
      const { camera } = cameraDevice;
      if (!camera) continue;
      camera.entity.transform.position = cameraDevice.pose.position;
      camera.entity.transform.rotationQuaternion = cameraDevice.pose.rotation;
      // sync viewport
      const { viewport } = camera;
      const { x, y, width, height } = cameraDevice.viewport;
      if (!(x === viewport.x && y === viewport.y && width === viewport.z && height === viewport.w)) {
        camera.viewport = viewport.set(x, y, width, height);
      }
      // sync project matrix
      if (!Matrix.equals(camera.projectionMatrix, cameraDevice.projectionMatrix)) {
        camera.projectionMatrix = cameraDevice.projectionMatrix;
      }
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
