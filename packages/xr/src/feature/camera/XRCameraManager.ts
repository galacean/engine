import { Camera, CameraClearFlags, CameraType, Matrix, Vector4 } from "@galacean/engine";
import { XRManagerExtended } from "../../XRManagerExtended";
import { XRCamera } from "../../input/XRCamera";
import { XRTrackedInputDevice } from "../../input/XRTrackedInputDevice";
import { XRSessionState } from "../../session/XRSessionState";

/**
 * The manager of XR camera.
 */
export class XRCameraManager {
  private readonly _cameraSettings = new Map<
    Camera,
    { viewport: Vector4; projection?: Matrix; near: number; far: number }
  >();

  /**
   * Fixed foveation, or `undefined` if unsupported by the active session.
   */
  get fixedFoveation(): number | undefined {
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
      if (preCamera) {
        this._restoreCamera(preCamera);
        preCamera._cameraType = CameraType.Normal;
      }
      switch (type) {
        case XRTrackedInputDevice.Camera:
          camera._cameraType = CameraType.XRCenterCamera;
          break;
        case XRTrackedInputDevice.LeftCamera:
          camera._cameraType = CameraType.XRLeftCamera;
          break;
        case XRTrackedInputDevice.RightCamera:
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
  ): Camera | null {
    const xrCamera = this._xrManager.inputManager.getTrackedDevice<XRCamera>(type);
    const preCamera = xrCamera._camera;
    if (preCamera) {
      this._restoreCamera(preCamera);
      preCamera._cameraType = CameraType.Normal;
    }
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
    const cameras = this._xrManager.inputManager._cameras;
    const platformSession = this._xrManager.sessionManager._platformSession;
    if (!platformSession) return;
    for (let i = 0, n = cameras.length; i < n; i++) {
      const cameraDevice = cameras[i];
      const { _camera: camera } = cameraDevice;
      if (!camera) continue;
      if (!this._cameraSettings.has(camera)) {
        this._cameraSettings.set(camera, {
          viewport: camera.viewport.clone(),
          projection: camera._isCustomProjectionMatrix ? camera.projectionMatrix.clone() : undefined,
          near: camera.nearClipPlane,
          far: camera.farClipPlane
        });
      }
      if (platformSession.depthNear !== undefined) camera.nearClipPlane = platformSession.depthNear;
      if (platformSession.depthFar !== undefined) camera.farClipPlane = platformSession.depthFar;
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
      // sync pixel viewport (only when rendering to XR main framebuffer)
      if (!camera.renderTarget) {
        // @ts-ignore
        camera._adjustPixelViewport(platformSession.framebufferWidth, platformSession.framebufferHeight);
      }
    }
  }

  /**
   * @internal
   */
  _onSessionExit(): void {
    for (const camera of this._cameraSettings.keys()) this._restoreCamera(camera);
  }

  private _restoreCamera(camera: Camera): void {
    const settings = this._cameraSettings.get(camera);
    if (!settings) return;
    this._cameraSettings.delete(camera);
    if (camera.destroyed) return;
    camera.viewport = settings.viewport;
    camera.nearClipPlane = settings.near;
    camera.farClipPlane = settings.far;
    if (settings.projection) camera.projectionMatrix = settings.projection;
    else camera.resetProjectionMatrix();
    // @ts-ignore
    camera._updatePixelViewport();
  }

  /**
   * @internal
   */
  _getIgnoreClearFlags(cameraType: CameraType): CameraClearFlags {
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
