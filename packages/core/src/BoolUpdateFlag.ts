import { removeFromArray } from "./base/Util";
import { UpdateFlag } from "./UpdateFlag";
import { UpdateFlagManager } from "./UpdateFlagManager";

/**
 * Used to update tags.
 */
export class BoolUpdateFlag extends UpdateFlag {
  /** @internal */
  _flagManagers: UpdateFlagManager[] = [];

  /** Flag. */
  flag = true;

  dispatch(): void {
    this.flag = true;
  }

  /**
   * Clear.
   */
  destroy(): void {
    for (let i = 0, n = this._flagManagers.length; i < n; i++) {
      removeFromArray(this._flagManagers[i]._updateFlags, this);
    }
    this._flagManagers.length = 0;
  }
}
