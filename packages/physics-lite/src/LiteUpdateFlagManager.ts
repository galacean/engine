import { LiteUpdateFlag } from "./LiteUpdateFlag";

/**
 * @internal
 */
export class LiteUpdateFlagManager {
  private _updateFlags: LiteUpdateFlag[] = [];

  register(): LiteUpdateFlag {
    return new LiteUpdateFlag(this._updateFlags);
  }

  distribute(): void {
    const updateFlags = this._updateFlags;
    for (let i = updateFlags.length - 1; i >= 0; i--) {
      updateFlags[i].flag = true;
    }
  }
}
