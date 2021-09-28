/**
 * Fastly remove an element from array.
 * @param array - Array
 * @param item - Element
 */
export function removeFromArray(array: any[], item: any): boolean {
  const index = array.indexOf(item);
  if (index < 0) {
    return false;
  }
  const last = array.length - 1;
  if (index !== last) {
    array[index] = array[last];
  }
  array.length--;
  return true;
}

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
    removeFromArray(this._flags, this);
    this._flags = null;
  }
}
