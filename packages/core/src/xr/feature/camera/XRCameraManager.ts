import { Matrix } from "@galacean/engine-math";
import { Camera } from "../../../Camera";
import { Engine } from "../../../Engine";
import { CameraClearFlags } from "../../../enums/CameraClearFlags";
import { XRCamera } from "../../input/XRCamera";
import { XRTrackedInputDevice } from "../../input/XRTrackedInputDevice";

/**
 * The manager of XR camera.
 */
export class XRCameraManager {
  /**
   * Return fixed foveation of the camera.
   */
  get fixedFoveation(): number {
    const { _platformSession: platformSession } = this._engine.xrManager.sessionManager;
    if (platformSession) {
      return platformSession.fixedFoveation;
    } else {
      throw new Error("XR session is not available.");
    }
  }

  set fixedFoveation(value: number) {
    const { _platformSession: platformSession } = this._engine.xrManager.sessionManager;
    if (platformSession) {
      platformSession.fixedFoveation = value;
    } else {
      throw new Error("XR session is not available.");
    }
  }

  /**
   * @internal
   */
  constructor(private _engine: Engine) {}

  /**
   * Attach the camera to the specified input type(Camera, LeftCamera or RightCamera).
   * The camera entity need to be moved to the XROrigin entity.
   * @param type - The input type
   * @param camera - The camera to be attached
   */
  attachCamera(
    type: XRTrackedInputDevice.Camera | XRTrackedInputDevice.LeftCamera | XRTrackedInputDevice.RightCamera,
    camera: Camera
  ): void {
    this._engine.xrManager.inputManager.getInput<XRCamera>(type).camera = camera;
  }

  /**
   * Detach the camera from the specified input type.
   * @param type - The input type
   * @returns The camera that was detached
   */
  detachCamera(
    type: XRTrackedInputDevice.Camera | XRTrackedInputDevice.LeftCamera | XRTrackedInputDevice.RightCamera
  ): Camera {
    const xrCamera = this._engine.xrManager.inputManager.getInput<XRCamera>(type);
    const preCamera = xrCamera.camera;
    xrCamera.camera = null;
    return preCamera;
  }

  /**
   * Get the camera by the specified input type.
   * @param type - The input type
   * @returns The camera
   */
  getCameraByType(
    type: XRTrackedInputDevice.Camera | XRTrackedInputDevice.LeftCamera | XRTrackedInputDevice.RightCamera
  ): Camera {
    return this._engine.xrManager.inputManager.getInput<XRCamera>(type).camera;
  }

  /**
   * @internal
   */
  _onSessionInit(): void {
    const { _cameras: cameras } = this._engine.xrManager.inputManager;
    for (let i = 0, n = cameras.length; i < n; i++) {
      const { camera } = cameras[i];
      camera && (camera.clearFlags &= ~CameraClearFlags.Color);
    }
  }

  /**
   * @internal
   */
  _onUpdate(): void {
    const { _cameras: cameras } = this._engine.xrManager.inputManager;
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
  _onSessionDestroy(): void {
    const { _cameras: cameras } = this._engine.xrManager.inputManager;
    for (let i = 0, n = cameras.length; i < n; i++) {
      const { camera } = cameras[i];
      camera && (camera.clearFlags |= CameraClearFlags.Color);
    }
  }

  /**
   * @internal
   */
  _onDestroy(): void {}
}
