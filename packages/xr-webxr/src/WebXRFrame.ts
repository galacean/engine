import { IXRCamera, IXRController, IXRFrame, IXRInput } from "@galacean/engine-design";
import { Vector3, XRTrackedInputDevice } from "@galacean/engine";
import { WebXRSession } from "./WebXRSession";
import { getInputSource, viewToCamera } from "./util";

export class WebXRFrame implements IXRFrame {
  /** @internal */
  _platformFrame: XRFrame;
  private _session: WebXRSession;

  updateInputs(inputs: IXRInput[]): void {
    if (!this._platformFrame) return;
    this._updateController(inputs);
    this._updateCamera(inputs);
  }

  private _updateController(inputs: IXRInput[]) {
    const { _platformFrame: frame } = this;
    const { _platformSession: session, _platformReferenceSpace: referenceSpace } = this._session;
    const { inputSources } = session;
    for (let i = 0, n = inputSources.length; i < n; i++) {
      const inputSource = inputSources[i];
      const type = getInputSource(inputSource);
      const input = <IXRController>inputs[type];
      switch (inputSource.targetRayMode) {
        case "screen":
        case "tracked-pointer":
          const { gripSpace, targetRaySpace } = inputSource;
          if (gripSpace) {
            const { transform, emulatedPosition } = frame.getPose(gripSpace, referenceSpace);
            if (transform) {
              const { gripPose } = input;
              gripPose.matrix.copyFromArray(transform.matrix);
              gripPose.position.copyFrom(transform.position);
              gripPose.rotation.copyFrom(transform.orientation);
            }
            input.trackingState = emulatedPosition ? 2 : 1;
          }
          if (targetRaySpace) {
            const { transform, emulatedPosition } = frame.getPose(targetRaySpace, referenceSpace);
            if (transform) {
              const { targetRayPose } = input;
              targetRayPose.matrix.copyFromArray(transform.matrix);
              targetRayPose.position.copyFrom(transform.position);
              targetRayPose.rotation.copyFrom(transform.orientation);
              input.trackingState = emulatedPosition ? 2 : 1;
            }
          }
          break;
        case "gaze":
          break;
        default:
          break;
      }
    }
  }

  private _updateCamera(inputs: IXRInput[]) {
    const { _platformFrame: frame } = this;
    const {
      _platformReferenceSpace: referenceSpace,
      _platformLayer: layer,
      framebufferWidth,
      framebufferHeight
    } = this._session;
    const viewerPose = frame.getViewerPose(referenceSpace);
    if (viewerPose) {
      let hadUpdateCenterViewer = false;
      const { views, emulatedPosition } = viewerPose;
      for (let i = 0, n = views.length; i < n; i++) {
        const view = views[i];
        const type = viewToCamera(view.eye);
        const { transform } = views[i];
        if (type === XRTrackedInputDevice.Camera) {
          hadUpdateCenterViewer ||= true;
        }
        const xrCamera = <IXRCamera>inputs[type];
        const { pose } = xrCamera;
        pose.matrix.copyFromArray(transform.matrix);
        pose.position.copyFrom(transform.position);
        pose.rotation.copyFrom(transform.orientation);
        xrCamera.projectionMatrix.copyFromArray(view.projectionMatrix);
        xrCamera.trackingState = emulatedPosition ? 2 : 1;
        const xrViewport = layer.getViewport(view);
        const width = xrViewport.width / framebufferWidth;
        const height = xrViewport.height / framebufferHeight;
        const x = xrViewport.x / framebufferWidth;
        const y = 1 - xrViewport.y / framebufferHeight - height;
        xrCamera.viewport.set(x, y, width, height);
      }

      if (!hadUpdateCenterViewer) {
        const leftCameraDevice = <IXRCamera>inputs[XRTrackedInputDevice.LeftCamera];
        const rightCameraDevice = <IXRCamera>inputs[XRTrackedInputDevice.RightCamera];
        const cameraDevice = <IXRCamera>inputs[XRTrackedInputDevice.Camera];
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
        cameraDevice.trackingState = emulatedPosition ? 2 : 1;
        cameraDevice.viewport =
          leftCameraDevice.viewport.width && leftCameraDevice.viewport.height
            ? leftCameraDevice.viewport
            : rightCameraDevice.viewport;
      }
    }
  }

  constructor(session: WebXRSession) {
    this._session = session;
  }
}
