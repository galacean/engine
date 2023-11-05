import { IXRInput, IXRPose } from "@galacean/engine-design";
import { XRTrackingState } from "../feature/trackable/XRTrackingState";

export abstract class XRInput implements IXRInput {
  /**
   * The tracking state of xr input.
   */
  trackingState: XRTrackingState = XRTrackingState.NotTracking;

  protected _pose: IXRPose;

  get pose(): IXRPose {
    return this._pose;
  }

  set pose(value: IXRPose) {
    this._pose = value;
  }
}
