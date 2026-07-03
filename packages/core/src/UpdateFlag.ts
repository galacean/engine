import { defaultCloneMode } from "./clone/CloneManager";
import { CloneMode } from "./clone/enums/CloneMode";
import { UpdateFlagManager } from "./UpdateFlagManager";
import { Utils } from "./Utils";

/**
 * Used to update tags.
 */
@defaultCloneMode(CloneMode.Ignore)
export abstract class UpdateFlag {
  /** @internal */
  _flagManagers: UpdateFlagManager[] = [];

  /**
   * Dispatch.
   * @param bit - Bit
   * @param param - Parameter
   */
  abstract dispatch(bit?: number, param?: object): void;

  /**
   * Clear.
   */
  clearFromManagers(): void {
    this._removeFromManagers();
    this._flagManagers.length = 0;
  }

  /**
   * Destroy.
   */
  destroy(): void {
    this._removeFromManagers();
    this._flagManagers = null;
  }

  private _removeFromManagers(): void {
    const flagManagers = this._flagManagers;
    for (let i = 0, n = flagManagers.length; i < n; i++) {
      Utils.removeFromArray(flagManagers[i]._updateFlags, this);
    }
  }
}
