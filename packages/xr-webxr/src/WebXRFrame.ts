import { Matrix, Vector3, XRCamera, XRController, XRInputType, XRTrackingState } from "@galacean/engine";
import { IXRFrame, IXRInput } from "@galacean/engine-design";
import { getInputSource, viewToCamera } from "./util";
import { WebXRSession } from "./WebXRSession";

export class WebXRFrame implements IXRFrame {
  _platformFrame: XRFrame;

  private _session: WebXRSession;

  updateInputs(inputs: IXRInput[]): void {
    const { _platformFrame: platformFrame } = this;
    const {
      _platformSession: session,
      _platformReferenceSpace: referenceSpace,
      _platformLayer: layer,
      framebufferWidth,
      framebufferHeight
    } = this._session;
    // Update controller
    const { inputSources } = session;
    for (let i = 0, n = inputSources.length; i < n; i++) {
      const inputSource = inputSources[i];
      const type = getInputSource(inputSource);
      const input = <XRController>inputs[type];
      switch (inputSource.targetRayMode) {
        case "screen":
        case "tracked-pointer":
          const { gripSpace, targetRaySpace } = inputSource;
          if (gripSpace) {
            const { transform, emulatedPosition } = platformFrame.getPose(gripSpace, referenceSpace);
            if (transform) {
              const { gripPose } = input;
              gripPose.matrix.copyFromArray(transform.matrix);
              gripPose.position.copyFrom(transform.position);
              gripPose.rotation.copyFrom(transform.orientation);
            }
            input.trackingState = emulatedPosition ? XRTrackingState.TrackingLost : XRTrackingState.Tracking;
          }
          if (targetRaySpace) {
            const { transform, emulatedPosition } = platformFrame.getPose(targetRaySpace, referenceSpace);
            if (transform) {
              const { targetRayPose } = input;
              targetRayPose.matrix.copyFromArray(transform.matrix);
              targetRayPose.position.copyFrom(transform.position);
              targetRayPose.rotation.copyFrom(transform.orientation);
              input.trackingState = emulatedPosition ? XRTrackingState.TrackingLost : XRTrackingState.Tracking;
            }
          }
          break;
        case "gaze":
          break;
        default:
          break;
      }
    }

    // update camera
    const viewerPose = platformFrame.getViewerPose(referenceSpace);
    if (viewerPose) {
      let hadUpdateCenterViewer = false;
      const { views, emulatedPosition } = viewerPose;
      for (let i = 0, n = views.length; i < n; i++) {
        const view = views[i];
        const type = viewToCamera(view.eye);
        const { transform } = views[i];
        if (type === XRInputType.Camera) {
          hadUpdateCenterViewer ||= true;
        }
        const xrCamera = <XRCamera>inputs[type];
        const { pose } = xrCamera;
        pose.matrix.copyFromArray(transform.matrix);
        pose.position.copyFrom(transform.position);
        pose.rotation.copyFrom(transform.orientation);
        xrCamera.projectionMatrix.copyFromArray(view.projectionMatrix);
        xrCamera.trackingState = emulatedPosition ? XRTrackingState.TrackingLost : XRTrackingState.Tracking;
        const xrViewport = layer.getViewport(view);
        const width = xrViewport.width / framebufferWidth;
        const height = xrViewport.height / framebufferHeight;
        const x = xrViewport.x / framebufferWidth;
        const y = 1 - xrViewport.y / framebufferHeight - height;
        xrCamera.viewport.set(x, y, width, height);
        const { camera } = xrCamera;
        if (camera) {
          const vec4 = camera.viewport;
          if (!(x === vec4.x && y === vec4.y && width === vec4.z && height === vec4.w)) {
            camera.viewport = vec4.set(x, y, width, height);
          }
          if (!Matrix.equals(camera.projectionMatrix, xrCamera.projectionMatrix)) {
            camera.projectionMatrix = xrCamera.projectionMatrix;
          }
        }
      }

      if (!hadUpdateCenterViewer) {
        const leftCameraDevice = <XRCamera>inputs[XRInputType.LeftCamera];
        const rightCameraDevice = <XRCamera>inputs[XRInputType.RightCamera];
        const cameraDevice = <XRCamera>inputs[XRInputType.Camera];
        const { pose: leftCameraPose } = leftCameraDevice;
        const { pose: rightCameraPose } = rightCameraDevice;
        const { pose: cameraPose } = cameraDevice;
        cameraPose.rotation.copyFrom(leftCameraPose.rotation);
        const { position, matrix } = cameraPose;
        Vector3.add(leftCameraPose.position, rightCameraPose.position, position);
        position.scale(0.5);
        matrix.copyFrom(leftCameraPose.matrix);
        const { elements } = matrix;
        elements[12] = position.x;
        elements[13] = position.y;
        elements[14] = position.z;
        cameraDevice.projectionMatrix.copyFrom(leftCameraDevice.projectionMatrix);
        cameraDevice.trackingState = emulatedPosition ? XRTrackingState.TrackingLost : XRTrackingState.Tracking;
        cameraDevice.viewport =
          leftCameraDevice.viewport.width && leftCameraDevice.viewport.height
            ? leftCameraDevice.viewport
            : rightCameraDevice.viewport;
        const { camera } = cameraDevice;
        if (camera) {
          // sync viewport
          const vec4 = camera.viewport;
          const { x, y, width, height } = cameraDevice.viewport;
          if (!(x === vec4.x && y === vec4.y && width === vec4.z && height === vec4.w)) {
            camera.viewport = vec4.set(x, y, width, height);
          }
          // sync project matrix
          if (!Matrix.equals(camera.projectionMatrix, cameraDevice.projectionMatrix)) {
            camera.projectionMatrix = cameraDevice.projectionMatrix;
          }
        }
      }
    }
  }

  constructor(session: WebXRSession) {
    this._session = session;
  }
}
