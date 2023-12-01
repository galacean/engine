import { Matrix, Rect } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { IXRInput } from "@galacean/engine-design";
import { XRTrackedInputDevice } from "./XRTrackedInputDevice";
import { XRTrackingState } from "./XRTrackingState";
import { XRPose } from "../XRPose";

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
  protected _pose: XRPose = new XRPose();

  /**
   * Return the pose of the input in XR space.
   */
  get pose(): XRPose {
    return this._pose;
  }

  constructor(public type: XRTrackedInputDevice) {}
}
