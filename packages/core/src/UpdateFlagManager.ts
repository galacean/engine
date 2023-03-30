import { removeFromArray } from "./base/Util";
import { UpdateFlag } from "./UpdateFlag";

/**
 * @internal
 */
export class UpdateFlagManager {
  /** @internal */
  _updateFlags: UpdateFlag[] = [];

  private _listensers: ((type?: number, param?: Object) => void)[] = [];

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
    const success = removeFromArray(this._updateFlags, flag);
    if (success) {
      removeFromArray(flag._flagManagers, this);
    }
  }

  /**
   * Add a listener.
   * @param listener - The listener
   */
  addListener(listener: (type?: number, param?: Object) => void): void {
    this._listensers.push(listener);
  }

  /**
   * Remove a listener.
   * @param listener - The listener
   */
  removeListener(listener: (type?: number, param?: Object) => void): void {
    removeFromArray(this._listensers, listener);
  }

  /**
   * Dispatch a event.
   * @param type - Event type, usually in the form of enumeration
   * @param param - Event param
   */
  dispatch(type?: number, param?: Object): void {
    const updateFlags = this._updateFlags;
    for (let i = updateFlags.length - 1; i >= 0; i--) {
      updateFlags[i].dispatch(type, param);
    }

    const listeners = this._listensers;
    for (let i = listeners.length - 1; i >= 0; i--) {
      listeners[i](type, param);
    }
  }
}
