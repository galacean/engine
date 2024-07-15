import { Script } from "@galacean/engine";
import { XRTracked } from "../feature/trackable/XRTracked";

export class XRTrackedComponent<T extends XRTracked> extends Script {
  private _data: T;
  private _destroyedOnRemoval = true;

  /**
   * Tracking data of the TrackedObject.
   */
  get data(): T {
    return this._data;
  }

  set data(value: T) {
    this._data = value;
  }

  /**
   * Whether to destroy when tracking is removed, default is true.
   */
  get destroyedOnRemoval(): boolean {
    return this._destroyedOnRemoval;
  }

  set destroyedOnRemoval(value: boolean) {
    this._destroyedOnRemoval = value;
  }
}
