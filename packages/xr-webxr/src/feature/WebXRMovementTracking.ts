import {
  Engine,
  EnumXRFeature,
  EnumXRFeatureChangeFlag,
  registerXRPlatformFeature,
  Matrix,
  IXRMovementTrackingDescriptor,
  EnumXRInputSource,
  EnumXRMode,
  XRViewer,
  Vector3,
  XRController
} from "@galacean/engine";
import { IXRFeature, IXRFeatureDescriptor } from "@galacean/engine-design";
import { WebXRSessionManager } from "../session/WebXRSessionManager";
import { WebXRInputManager } from "../input/WebXRInputManager";
import { getInputSource } from "../util";

@registerXRPlatformFeature(EnumXRFeature.MovementTracking)
export class WebXRMovementTracking implements IXRFeature {
  descriptor: IXRMovementTrackingDescriptor;

  private _engine: Engine;
  private _inputManager: WebXRInputManager;
  private _sessionManager: WebXRSessionManager;

  _onUpdate(): void {
    const { _engine: engine, _inputManager: inputManager, _sessionManager: sessionManager } = this;
    const { _platformSession, _platformFrame, _platformLayer, _platformSpace } = sessionManager;
    if (!_platformFrame || !_platformLayer || !_platformSpace) {
      return;
    }
    // Update the pose of xr input.
    const { inputSources } = _platformSession;
    for (let i = 0, n = inputSources.length; i < n; i++) {
      const inputSource = inputSources[i];
      const type = getInputSource(inputSource);
      const input = inputManager.getInput<XRController>(type);
      input.connected = true;
      switch (inputSource.targetRayMode) {
        case "screen":
        case "tracked-pointer":
          const { gripSpace, targetRaySpace } = inputSource;
          if (gripSpace) {
            const { transform } = _platformFrame.getPose(gripSpace, _platformSpace);
            if (transform) {
              input.matrix.copyFromArray(transform.matrix);
              input.position.copyFrom(transform.position);
              input.quaternion.copyFrom(transform.orientation);
            }
          }
          if (targetRaySpace) {
            const { transform } = _platformFrame.getPose(targetRaySpace, _platformSpace);
            if (transform) {
              input.targetRayMatrix.copyFromArray(transform.matrix);
              input.targetRayPosition.copyFrom(transform.position);
              input.targetRayQuaternion.copyFrom(transform.orientation);
            }
          }
          break;
        case "gaze":
          break;
        default:
          break;
      }
    }

    // Update xr viewer information.
    const viewerPose = _platformFrame.getViewerPose(_platformSpace);
    if (viewerPose) {
      let hadUpdateCenterViewer = false;
      const views = viewerPose.views;
      for (let i = 0, n = views.length; i < n; i++) {
        const view = views[i];
        const { transform } = views[i];
        const type = this._eyeToInputSource(view.eye);
        if (type === EnumXRInputSource.Viewer) {
          hadUpdateCenterViewer ||= true;
        }
        const xrCamera = inputManager.getInput<XRViewer>(type);
        xrCamera.matrix.copyFromArray(transform.matrix);
        xrCamera.position.copyFrom(transform.position);
        xrCamera.quaternion.copyFrom(transform.orientation);
        xrCamera.projectionMatrix.copyFromArray(view.projectionMatrix);
        xrCamera.connected = true;
        if (_platformLayer) {
          const { framebufferWidth, framebufferHeight } = _platformLayer;
          const xrViewport = _platformLayer.getViewport(view);
          const width = xrViewport.width / framebufferWidth;
          const height = xrViewport.height / framebufferHeight;
          const x = xrViewport.x / framebufferWidth;
          const y = 1 - xrViewport.y / framebufferHeight - height;
          xrCamera.viewport.set(x, y, width, height);
          const { camera } = xrCamera;
          if (camera) {
            // sync viewport
            const vec4 = camera.viewport;
            if (!(x === vec4.x && y === vec4.y && width === vec4.z && height === vec4.w)) {
              camera.viewport = vec4.set(x, y, width, height);
            }
            // sync project matrix
            if (!Matrix.equals(camera.projectionMatrix, xrCamera.projectionMatrix)) {
              camera.projectionMatrix = xrCamera.projectionMatrix;
            }
          }
        }
      }

      if (!hadUpdateCenterViewer && engine.xrModule.mode === EnumXRMode.AR) {
        const leftViewer = inputManager.getInput<XRViewer>(EnumXRInputSource.LeftViewer);
        const rightViewer = inputManager.getInput<XRViewer>(EnumXRInputSource.RightViewer);
        const viewer = inputManager.getInput<XRViewer>(EnumXRInputSource.Viewer);
        viewer.quaternion.copyFrom(leftViewer.quaternion);
        const { position, matrix } = viewer;
        Vector3.add(leftViewer.position, rightViewer.position, position);
        position.scale(0.5);
        matrix.copyFrom(leftViewer.matrix);
        const { elements } = matrix;
        elements[12] = position.x;
        elements[13] = position.y;
        elements[14] = position.z;
        viewer.projectionMatrix.copyFrom(leftViewer.projectionMatrix);
        viewer.connected = true;
        viewer.viewport =
          leftViewer.viewport.width && leftViewer.viewport.height ? leftViewer.viewport : rightViewer.viewport;
        const { camera } = viewer;
        if (camera) {
          // sync viewport
          const vec4 = camera.viewport;
          const { x, y, width, height } = viewer.viewport;
          if (!(x === vec4.x && y === vec4.y && width === vec4.z && height === vec4.w)) {
            camera.viewport = vec4.set(x, y, width, height);
          }
          // sync project matrix
          if (!Matrix.equals(camera.projectionMatrix, viewer.projectionMatrix)) {
            camera.projectionMatrix = viewer.projectionMatrix;
          }
        }
      }
    }
  }

  _isSupported(descriptor: IXRFeatureDescriptor): Promise<void> {
    return new Promise((resolve) => {
      resolve();
    });
  }

  _initialize(descriptor: IXRMovementTrackingDescriptor): Promise<void> {
    return new Promise((resolve, reject) => {
      this.descriptor = descriptor;
      resolve();
    });
  }

  _onFlagChange(flag: EnumXRFeatureChangeFlag, ...param): void {
    switch (flag) {
      case EnumXRFeatureChangeFlag.Enable:
        break;

      default:
        break;
    }
  }

  _onDestroy(): void {}

  private _eyeToInputSource(eye: XREye): EnumXRInputSource {
    switch (eye) {
      case "left":
        return EnumXRInputSource.LeftViewer;
      case "right":
        return EnumXRInputSource.RightViewer;
      default:
        return EnumXRInputSource.Viewer;
    }
  }

  constructor(engine: Engine) {
    this._engine = engine;
    const { xrModule } = engine;
    this._inputManager = <WebXRInputManager>xrModule.inputManager;
    this._sessionManager = <WebXRSessionManager>xrModule.sessionManager;
  }
}
