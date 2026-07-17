import { UpdateFlag } from "./UpdateFlag";
import { Utils } from "./Utils";

/**
 * @internal
 */
export class UpdateFlagManager {
  /** Monotonic counter bumped on every `dispatch`; consumers can snapshot it for lazy pull-style cache invalidation. */
  version = 0;

  _updateFlags: UpdateFlag[] = [];

  private _listeners: ((type?: number, param?: object) => void)[] = [];

  /**
   * Create a UpdateFlag.
   * @returns - The UpdateFlag.
   */
  createFlag<T extends UpdateFlag>(type: new () => T): T {
    const flag = new type();
    this.addFlag(flag);
    return flag;
  }

  /**
   * Add a UpdateFlag.
   * @param flag - The UpdateFlag.
   */
  addFlag(flag: UpdateFlag): void {
    this._updateFlags.push(flag);
    flag._flagManagers.push(this);
  }

  /**
   * Remove a UpdateFlag.
   * @param flag - The UpdateFlag.
   */
  removeFlag(flag: UpdateFlag): void {
    const success = Utils.removeFromArray(this._updateFlags, flag);
    if (success) {
      Utils.removeFromArray(flag._flagManagers, this);
    }
  }

  /**
   * Add a listener.
   * @param listener - The listener
   */
  addListener(listener: (type?: number, param?: object) => void): void {
    this._listeners.push(listener);
  }

  /**
   * Remove a listener.
   * @param listener - The listener
   */
  removeListener(listener: (type?: number, param?: object) => void): void {
    Utils.removeFromArray(this._listeners, listener);
  }

  /**
   * Dispatch a event.
   * @param type - Event type, usually in the form of enumeration
   * @param param - Event param
   */
  dispatch(type?: number, param?: object): void {
    this.version++;

    const updateFlags = this._updateFlags;
    for (let i = updateFlags.length - 1; i >= 0; i--) {
      updateFlags[i].dispatch(type, param);
    }

    const listeners = this._listeners;
    for (let i = listeners.length - 1; i >= 0; i--) {
      listeners[i](type, param);
    }
  }
}
