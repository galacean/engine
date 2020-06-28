/**
 * 由于更新标记。
 */
export class UpdateFlag {
  private _flag = true;

  constructor(private _flags: UpdateFlag[] = []) {}

  /**
   * 标记。
   */
  get flag(): boolean {
    return this._flag;
  }

  set flag(value: boolean) {
    this._flag = value;
  }

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
