/**
 * Used to update tags.
 */
import { removeFromArray } from "./Util";

export class UpdateFlag {
  /** Flag. */
  flag = true;

  constructor(private _flags: UpdateFlag[] = []) {
    this._flags.push(this);
  }

  /**
   * Destroy.
   */
  destroy(): void {
    const flags = this._flags;
    removeFromArray(flags, this);
    this._flags = null;
  }
}
