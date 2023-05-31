export class SafeLoopArray<T> {
  private _array: T[] = [];
  private _loopArray: T[] = [];
  private _loopArrayDirty: boolean = false;

  /**
   * Get the length of the array.
   */
  get length(): number {
    return this._array.length;
  }

  /**
   * Push item to the array.
   * @param item - The item which want to be pushed
   */
  push(item: T): void {
    this._array.push(item);
    this._loopArrayDirty = true;
  }

  /**
   * Add item to the array.
   * @param index - The index of the array
   * @param item - The item which want to be added
   */
  add(index: number, item: T): void {
    this._array.splice(index, 0, item);
    this._loopArrayDirty = true;
  }

  /**
   * Remove item from the array.
   * @param index - The index of the array
   */
  removeByIndex(index: number): void {
    this._array.splice(index, 1);
    this._loopArrayDirty = true;
  }

  /**
   * The index of the item.
   * @param item - The item which want to get the index
   * @returns Index of the item
   */
  indexOf(item: T): number {
    return this._array.indexOf(item);
  }

  /**
   * Get the array.
   * @returns The array
   */
  getArray(): ReadonlyArray<T> {
    return this._array;
  }

  /**
   * Get the array use for loop.
   * @returns The array use for loop
   */
  getLoopArray(): ReadonlyArray<T> {
    const loopArray = this._loopArray;
    if (this._loopArrayDirty) {
      const array = this._array;
      const count = array.length;
      loopArray.length = count;
      for (let i = 0; i < count; i++) {
        loopArray[i] = array[i];
      }
      this._loopArrayDirty = false;
    }
    return loopArray;
  }
}
