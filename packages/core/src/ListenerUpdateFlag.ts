import { removeFromArray } from "./base/Util";
import { UpdateFlag } from "./UpdateFlag";
import { UpdateFlagManager } from "./UpdateFlagManager";

/**
 * Used to update tags.
 */
export class ListenerUpdateFlag extends UpdateFlag {
  /** @internal */
  _flagManagers: UpdateFlagManager[] = [];

  /** Listener. */
  listener: Function;

  dispatch(param?: Object): void {
    this.listener && this.listener(param);
  }

  /**
   * Destroy.
   */
  destroy(): void {
    for (let i = 0, n = this._flagManagers.length; i < n; i++) {
      removeFromArray(this._flagManagers[i]._updateFlags, this);
    }
    this._flagManagers.length = 0;
  }
}
