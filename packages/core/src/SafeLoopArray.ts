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
   * Splice the array.
   * @param index - The index of the array
   * @param deleteCount - The count of the array which want to be deleted
   * @param item - The item which want to be added
   */
  splice(index: number, deleteCount: number, item?: T): void {
    this._array.splice(index, deleteCount, item);
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
