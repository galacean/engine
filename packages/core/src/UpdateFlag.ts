import { removeFromArray } from "./base/Util";
import { UpdateFlagManager } from "./UpdateFlagManager";

/**
 * Used to update tags.
 */
export abstract class UpdateFlag {
  /** @internal */
  _flagManagers: UpdateFlagManager[] = [];

  /**
   * Dispatch.
   * @param param - Parameter
   */
  abstract dispatch(param?: Object): void;

  /**
   * Clear.
   */
  clearFromManagers(): void {
    const flagManagers = this._flagManagers;
    for (let i = 0, n = flagManagers.length; i < n; i++) {
      removeFromArray(flagManagers[i]._updateFlags, this);
    }
    flagManagers.length = 0;
  }

  /**
   * Destroy.
   */
  destroy(): void {
    const flagManagers = this._flagManagers;
    for (let i = 0, n = flagManagers.length; i < n; i++) {
      removeFromArray(flagManagers[i]._updateFlags, this);
    }
    this._flagManagers = null;
  }
}
