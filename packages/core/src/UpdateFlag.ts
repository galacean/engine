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
    const index = flags.indexOf(this);
    const last = flags.length - 1;
    if (index !== last) {
      const end = flags[last];
      flags[index] = end;
    }
    flags.length--;
    this._flags = null;
  }
}
