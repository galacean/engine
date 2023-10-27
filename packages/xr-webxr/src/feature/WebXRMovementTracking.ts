import {
  Engine,
  EnumXRFeature,
  EnumXRFeatureChangeFlag,
  registerXRPlatformFeature,
  Matrix,
  EnumXRInputSource,
  EnumXRMode,
  XRViewer,
  Vector3,
  XRController,
  XRPlatformFeature,
  XRInputTrackingState
} from "@galacean/engine";
import { WebXRSessionManager } from "../session/WebXRSessionManager";
import { WebXRInputManager } from "../input/WebXRInputManager";
import { eyeToInputSource, getInputSource } from "../util";

@registerXRPlatformFeature(EnumXRFeature.MovementTracking)
export class WebXRMovementTracking extends XRPlatformFeature {
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
      switch (inputSource.targetRayMode) {
        case "screen":
        case "tracked-pointer":
          const { gripSpace, targetRaySpace } = inputSource;
          if (gripSpace) {
            const { transform, emulatedPosition } = _platformFrame.getPose(gripSpace, _platformSpace);
            if (transform) {
              input.matrix.copyFromArray(transform.matrix);
              input.position.copyFrom(transform.position);
              input.quaternion.copyFrom(transform.orientation);
            }
            input.trackingState = emulatedPosition ? XRInputTrackingState.TrackingLost : XRInputTrackingState.Tracking;
          }
          if (targetRaySpace) {
            const { transform, emulatedPosition } = _platformFrame.getPose(targetRaySpace, _platformSpace);
            if (transform) {
              input.targetRayMatrix.copyFromArray(transform.matrix);
              input.targetRayPosition.copyFrom(transform.position);
              input.targetRayQuaternion.copyFrom(transform.orientation);
              input.trackingState = emulatedPosition
                ? XRInputTrackingState.TrackingLost
                : XRInputTrackingState.Tracking;
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
      const { views, emulatedPosition } = viewerPose;
      for (let i = 0, n = views.length; i < n; i++) {
        const view = views[i];
        const { transform } = views[i];
        const type = eyeToInputSource(view.eye);
        if (type === EnumXRInputSource.Viewer) {
          hadUpdateCenterViewer ||= true;
        }
        const viewer = inputManager.getInput<XRViewer>(type);
        viewer.matrix.copyFromArray(transform.matrix);
        viewer.position.copyFrom(transform.position);
        viewer.quaternion.copyFrom(transform.orientation);
        viewer.projectionMatrix.copyFromArray(view.projectionMatrix);
        viewer.trackingState = emulatedPosition ? XRInputTrackingState.TrackingLost : XRInputTrackingState.Tracking;
        if (_platformLayer) {
          const { framebufferWidth, framebufferHeight } = _platformLayer;
          const xrViewport = _platformLayer.getViewport(view);
          const width = xrViewport.width / framebufferWidth;
          const height = xrViewport.height / framebufferHeight;
          const x = xrViewport.x / framebufferWidth;
          const y = 1 - xrViewport.y / framebufferHeight - height;
          viewer.viewport.set(x, y, width, height);
          const { camera } = viewer;
          if (camera) {
            // sync viewport
            const vec4 = camera.viewport;
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
        viewer.trackingState = emulatedPosition ? XRInputTrackingState.TrackingLost : XRInputTrackingState.Tracking;
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

  _onFlagChange(flag: EnumXRFeatureChangeFlag, ...param): void {
    switch (flag) {
      case EnumXRFeatureChangeFlag.Enable:
        break;

      default:
        break;
    }
  }

  _onDestroy(): void {}

  constructor(engine: Engine) {
    super(engine);
    const { xrModule } = engine;
    this._inputManager = <WebXRInputManager>xrModule.inputManager;
    this._sessionManager = <WebXRSessionManager>xrModule.sessionManager;
  }
}
