import { Matrix } from "@galacean/engine-math";
import { Camera } from "../../../Camera";
import { Engine } from "../../../Engine";
import { XRCamera } from "../../input/XRCamera";
import { XRInputManager } from "../../input/XRInputManager";
import { XRInputType } from "../../input/XRInputType";
import { XRSessionManager } from "../../session/XRSessionManager";

/**
 * The manager of XR camera.
 */
export class XRCameraManager {
  private _inputManager: XRInputManager;
  private _sessionManager: XRSessionManager;

  /**
   * Attach the camera to the specified input type(Camera, LeftCamera or RightCamera).
   * The camera entity need to be moved to the XROrigin entity.
   * @param type - The input type
   * @param camera - The camera to be attached
   */
  attachCamera(type: XRInputType.Camera | XRInputType.LeftCamera | XRInputType.RightCamera, camera: Camera): void {
    this._inputManager.getInput<XRCamera>(type).camera = camera;
  }

  /**
   * Detach the camera from the specified input type.
   * @param type - The input type
   * @returns The camera that was detached
   */
  detachCamera(type: XRInputType.Camera | XRInputType.LeftCamera | XRInputType.RightCamera): Camera {
    const xrCamera = this._inputManager.getInput<XRCamera>(type);
    const preCamera = xrCamera.camera;
    xrCamera.camera = null;
    return preCamera;
  }

  /**
   * Get the camera by the specified input type.
   * @param type - The input type
   * @returns The camera
   */
  getCameraByType(type: XRInputType.Camera | XRInputType.LeftCamera | XRInputType.RightCamera): Camera {
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

  /**
   * @internal
   */
  _onUpdate(): void {
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

  /**
   * @internal
   */
  _onDestroy(): void {}

  constructor(engine: Engine) {
    const { xrManager } = engine;
    this._inputManager = xrManager.inputManager;
    this._sessionManager = xrManager.sessionManager;
  }
}
