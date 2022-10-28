import { removeFromArray } from "./base/Util";
import { UpdateFlag } from "./UpdateFlag";

/**
 * @internal
 */
export class UpdateFlagManager {
  /** @internal */
  _updateFlags: UpdateFlag[] = [];

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
   * Dispatch.
   */
  dispatch(bit?: number, param?: Object): void {
    const updateFlags = this._updateFlags;
    for (let i = updateFlags.length - 1; i >= 0; i--) {
      updateFlags[i].dispatch(bit, param);
    }
  }
}
