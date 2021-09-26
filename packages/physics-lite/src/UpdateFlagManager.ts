import { UpdateFlag } from "./UpdateFlag";

/**
 * @internal
 */
export class UpdateFlagManager {
  private _updateFlags: UpdateFlag[] = [];

  register(): UpdateFlag {
    return new UpdateFlag(this._updateFlags);
  }

  distribute(): void {
    const updateFlags = this._updateFlags;
    for (let i = updateFlags.length - 1; i >= 0; i--) {
      updateFlags[i].flag = true;
    }
  }
}
