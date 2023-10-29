import { Component } from "../../Component";
import { XRTrackingState } from "../enum/XRTrackedState";

export class XRTrackable extends Component {
  private _trackingState: XRTrackingState = XRTrackingState.NotTracking;
  private _sessionRelativeData: any;

  get trackingState(): XRTrackingState {
    return this._trackingState;
  }

  get sessionRelativeData(): any {
    return this._sessionRelativeData;
  }

  _setSessionRelativeData(value: any) {
    this._sessionRelativeData = value;
  }
}
