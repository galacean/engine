import { removeFromArray } from "./base/Util";

/**
 * 由于更新标记。
 */
export class UpdateFlag {
  /** 标记。 */
  flag = true;

  constructor(private _flags: UpdateFlag[] = []) {}

  /**
   * 销毁。
   */
  destroy(): void {
    const flags = this._flags;
    removeFromArray(flags, this);
    this._flags = null;
  }
}
