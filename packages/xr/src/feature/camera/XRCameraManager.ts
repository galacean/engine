import { Camera, CameraClearFlags, CameraType, Matrix } from "@galacean/engine";
import { XRManagerExtended } from "../../XRManagerExtended";
import { XRCamera } from "../../input/XRCamera";
import { XRTrackedInputDevice } from "../../input/XRTrackedInputDevice";
import { XRSessionState } from "../../session/XRSessionState";

/**
 * The manager of XR camera.
 */
export class XRCameraManager {
  /**
   * The fixed foveation of the camera.
   */
  get fixedFoveation(): number {
    const { _platformSession: platformSession } = this._xrManager.sessionManager;
    if (platformSession) {
      return platformSession.getFixedFoveation();
    } else {
      throw new Error("XR session is not available.");
    }
  }

  set fixedFoveation(value: number) {
    const { _platformSession: platformSession } = this._xrManager.sessionManager;
    if (platformSession) {
      platformSession.setFixedFoveation(value);
    } else {
      throw new Error("XR session is not available.");
    }
  }

  /**
   * @internal
   */
  constructor(private _xrManager: XRManagerExtended) {}

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
    const xrCamera = this._xrManager.inputManager.getTrackedDevice<XRCamera>(type);
    const preCamera = xrCamera._camera;
    if (preCamera !== camera) {
      // @ts-ignore
      preCamera && (preCamera._cameraType = CameraType.Normal);
      switch (type) {
        case XRTrackedInputDevice.Camera:
          // @ts-ignore
          camera._cameraType = CameraType.XRCenterCamera;
          break;
        case XRTrackedInputDevice.LeftCamera:
          // @ts-ignore
          camera._cameraType = CameraType.XRLeftCamera;
          break;
        case XRTrackedInputDevice.RightCamera:
          // @ts-ignore
          camera._cameraType = CameraType.XRRightCamera;
          break;
        default:
          break;
      }
      xrCamera._camera = camera;
    }
  }

  /**
   * Detach the camera from the specified input type.
   * @param type - The input type
   * @returns The camera that was detached
   */
  detachCamera(
    type: XRTrackedInputDevice.Camera | XRTrackedInputDevice.LeftCamera | XRTrackedInputDevice.RightCamera
  ): Camera {
    const xrCamera = this._xrManager.inputManager.getTrackedDevice<XRCamera>(type);
    const preCamera = xrCamera._camera;
    // @ts-ignore
    preCamera && (preCamera._cameraType = CameraType.Normal);
    xrCamera._camera = null;
    return preCamera;
  }

  /**
   * @internal
   */
  _onSessionStart(): void {}

  /**
   * @internal
   */
  _onUpdate(): void {
    const { _cameras: cameras } = this._xrManager.inputManager;
    for (let i = 0, n = cameras.length; i < n; i++) {
      const cameraDevice = cameras[i];
      const { _camera: camera } = cameraDevice;
      if (!camera) continue;
      // sync position and rotation
      const { transform } = camera.entity;
      const { pose } = cameraDevice;
      transform.position = pose.position;
      transform.rotationQuaternion = pose.rotation;
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
  _onSessionExit(): void {}

  /**
   * @internal
   */
  _getCameraIgnoreClearFlags(cameraType: CameraType): CameraClearFlags {
    if (cameraType === CameraType.XRCenterCamera) {
      if (this._xrManager.sessionManager.state === XRSessionState.Running) {
        return CameraClearFlags.Color;
      } else {
        return CameraClearFlags.None;
      }
    } else {
      return CameraClearFlags.None;
    }
  }

  /**
   * @internal
   */
  _onDestroy(): void {}
}
