import { Matrix, Quaternion, Rect, Vector3 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { IXRInput, IXRPose } from "@galacean/engine-design";
import { XRTrackedInputDevice } from "./XRTrackedInputDevice";
import { XRTrackingState } from "./XRTrackingState";

/**
 * The XR camera.
 */
export class XRCamera implements IXRInput {
  /** The tracking state of xr input. */
  trackingState: XRTrackingState = XRTrackingState.NotTracking;
  /** The viewport of the camera. */
  viewport: Rect = new Rect();
  /** The projection matrix of the camera. */
  projectionMatrix: Matrix = new Matrix();
  /** The associated virtual camera. */
  camera: Camera;

  /** The pose of the input. */
  protected _pose: IXRPose;

  /**
   * Return the pose of the input.
   */
  get pose(): IXRPose {
    return this._pose;
  }

  constructor(public type: XRTrackedInputDevice) {
    this._pose = { matrix: new Matrix(), rotation: new Quaternion(), position: new Vector3() };
  }
}
