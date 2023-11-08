import { IXRTrackable } from "@galacean/engine-design";
import { Component } from "../../../Component";
import { XRTrackingState } from "../../feature/trackable/XRTrackingState";

/**
 * The base class of all tracked objects in the XR world.
 */
export abstract class XRTracked<T extends IXRTrackable> extends Component {
  protected _platformData: T;
  protected _destroyOnRemoval: boolean = true;

  /**
   * Returns whether the tracked object should be destroyed when it is removed from the XR world.
   */
  get destroyOnRemoval(): boolean {
    return this._destroyOnRemoval;
  }

  set destroyOnRemoval(value: boolean) {
    this._destroyOnRemoval = value;
  }

  /**
   * Returns the id of the tracked object.
   */
  get trackableId(): number {
    return this._platformData.id;
  }

  get trackingState(): XRTrackingState {
    return this._platformData.state;
  }

  /**
   * Returns the platform data of the tracked object.
   */
  get platformData(): T {
    return this._platformData;
  }

  set platformData(value: T) {
    this._platformData = value;
  }
}
