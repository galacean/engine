import { Utils } from "@galacean/engine";

/**
 * Used to update tags.
 */
export class LiteUpdateFlag {
  /** Flag. */
  flag = true;

  constructor(private _flags: LiteUpdateFlag[] = []) {
    this._flags.push(this);
  }

  /**
   * Destroy.
   */
  destroy(): void {
    Utils.removeFromArray(this._flags, this);
    this._flags = null;
  }
}
