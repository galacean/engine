import { IXRInput, IXRPose } from "@galacean/engine-design";
import { XRInputTrackingState } from "./XRInputTrackingState";

export abstract class XRInput implements IXRInput {
  protected _pose: IXRPose;
  protected _trackingState: XRInputTrackingState = XRInputTrackingState.NotTracking;
  protected _listeners: ((from: XRInputTrackingState, to: XRInputTrackingState) => any)[] = [];

  get pose(): IXRPose {
    return this._pose;
  }

  set pose(value: IXRPose) {
    this._pose = value;
  }

  get trackingState(): XRInputTrackingState {
    return this._trackingState;
  }

  set trackingState(value: XRInputTrackingState) {
    if (this._trackingState !== value) {
      const preValue = this._trackingState;
      this._trackingState = value;
      const { _listeners: listeners } = this;
      for (let i = 0, n = listeners.length; i < n; i++) {
        listeners[i](preValue, value);
      }
    }
  }

  addTrackingStateChangeListener(listener: (from: XRInputTrackingState, to: XRInputTrackingState) => any): void {
    this._listeners.push(listener);
  }

  removeTrackingStateChangeListener(listener: (from: XRInputTrackingState, to: XRInputTrackingState) => any): void {
    const idx = this._listeners.indexOf(listener);
    if (idx >= 0) {
      this._listeners.splice(idx, 1);
    }
  }
}
