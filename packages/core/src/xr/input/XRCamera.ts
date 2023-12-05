import { IXRCamera } from "@galacean/engine-design";
import { Matrix, Rect } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { CameraType } from "../../enums/CameraType";
import { XRPose } from "../XRPose";
import { XRInput } from "./XRInput";
import { XRTrackedInputDevice } from "./XRTrackedInputDevice";

/**
 * The XR camera.
 */
export class XRCamera extends XRInput implements IXRCamera {
  /** The pose of the camera in XR space. */
  pose: XRPose = new XRPose();
  /** The viewport of the camera. */
  viewport: Rect = new Rect();
  /** The projection matrix of the camera. */
  projectionMatrix: Matrix = new Matrix();

  private _camera: Camera;

  /**
   *  The associated virtual camera.
   */
  get camera(): Camera {
    return this._camera;
  }

  set camera(value: Camera) {
    const preCamera = this._camera;
    if (preCamera !== value) {
      preCamera && (preCamera._cameraType = CameraType.Normal);
      switch (this.type) {
        case XRTrackedInputDevice.Camera:
          value._cameraType = CameraType.XRCenterCamera;
          break;
        case XRTrackedInputDevice.LeftCamera:
          value._cameraType = CameraType.XRLeftCamera;
          break;
        case XRTrackedInputDevice.RightCamera:
          value._cameraType = CameraType.XRRightCamera;
          break;
        default:
          break;
      }
    }
  }
}
