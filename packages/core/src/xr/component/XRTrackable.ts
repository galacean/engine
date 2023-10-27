import { Component } from "../../Component";
import { TrackingStateChangeFlags } from "../enum/TrackingStateChangeFlags";

export class XRTrackable extends Component {
  private _trackingState: TrackingStateChangeFlags = TrackingStateChangeFlags.NotTracking;
  private _sessionRelativeData: any;

  get trackingState(): TrackingStateChangeFlags {
    return this._trackingState;
  }

  get sessionRelativeData(): any {
    return this._sessionRelativeData;
  }

  _setSessionRelativeData(value: any) {
    this._sessionRelativeData = value;
  }
}
