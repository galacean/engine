import { IXRTrackable } from "@galacean/engine-design";
import { Component } from "../../../Component";
import { XRTrackingState } from "../../feature/trackable/XRTrackingState";

export abstract class XRTracked<T extends IXRTrackable> extends Component {
  protected _platformData: T;
  protected _destroyOnRemoval: boolean = true;

  get destroyOnRemoval(): boolean {
    return this._destroyOnRemoval;
  }

  set destroyOnRemoval(value: boolean) {
    this._destroyOnRemoval = value;
  }

  get trackableId(): number {
    return this._platformData.id;
  }

  get trackingState(): XRTrackingState {
    return this._platformData.state;
  }

  setSessionRelativeData(data: T) {
    this._platformData = data;
  }
}
