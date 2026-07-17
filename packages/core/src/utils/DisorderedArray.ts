import { Utils } from "../Utils";

/**
 * High-performance unordered array, delete uses exchange method to improve performance, internal capacity only increases.
 */
export class DisorderedArray<T> {
  /** The length of the array. */
  length = 0;

  /** @internal */
  _elements: T[];

  private _loopCounter = 0; // Ignore nested loops, use counter to solve the problem
  private _blankCount = 0;

  /**
   * Get whether the array is in the loop.
   */
  get isLopping(): boolean {
    return this._loopCounter > 0;
  }

  /**
   * Create a DisorderedArray.
   * @param count - The initial length of the array
   */
  constructor(count: number = 0) {
    this._elements = new Array<T>(count);
  }

  /**
   * Add an element to disordered array.
   * @param element - The element to be added
   */
  add(element: T): void {
    if (this.length === this._elements.length) {
      this._elements.push(element);
    } else {
      this._elements[this.length] = element;
    }
    this.length++;
  }

  /**
   * Delete the specified element.
   * @param element - The element to be deleted
   */
  delete(element: T): void {
    // @todo: It can be optimized for custom binary search and other algorithms, currently this._elements>=this.length wastes performance.
    const index = this._elements.indexOf(element);
    this.deleteByIndex(index);
  }

  /**
   * Set the element at the specified index.
   * @param index - The index of the element to be set
   * @param element - The element to be set
   */
  set(index: number, element: T): void {
    if (index >= this.length) {
      throw "Index is out of range.";
    }
    this._elements[index] = element;
  }

  /**
   * Get the element at the specified index.
   * @param index - The index of the element to be get
   * @returns The element at the specified index
   */
  get(index: number): T {
    if (index >= this.length) {
      throw "Index is out of range.";
    }
    return this._elements[index];
  }

  /**
   * Delete the element at the specified index.
   * @param index - The index of the element to be deleted
   * @returns The replaced item is used to reset its index
   */
  deleteByIndex(index: number): T {
    const elements = this._elements;
    let end: T;
    if (this._loopCounter > 0) {
      this._elements[index] = null;
      this._blankCount++;
    } else {
      const endIndex = this.length - 1;
      if (index !== endIndex) {
        end = elements[endIndex];
        elements[index] = end;
      }
      elements[endIndex] = null;
      this.length--;
    }

    return end;
  }

  /**
   * Loop through all elements.
   * @param callbackFn - The callback function
   * @param swapFn - The swap function can process the element after the callback function, it will be called after end looping(`isLopping` = true)
   */
  forEach(callbackFn: (element: T, index: number) => void, swapFn?: (element: T, index: number) => void): void {
    this._startLoop();
    const elements = this._elements;
    for (let i = 0, n = this.length; i < n; i++) {
      const element = elements[i];
      element && callbackFn(element, i);
    }
    this._endLoop(swapFn);
  }

  /**
   * Loop through all elements and clean up the blank elements.
   * @param callbackFn - The callback function
   * @param swapFn - The swap function can process the element after the callback function,  it will be called after end looping(`isLopping` = true)
   */
  forEachAndClean(callbackFn: (element: T, index: number) => void, swapFn?: (element: T, index: number) => void): void {
    this._startLoop();
    const preEnd = this.length;
    const elements = this._elements;
    for (let i = 0, n = preEnd; i < n; i++) {
      const element = elements[i];
      element && callbackFn(element, i);
    }
    this._endLoopAndClean(preEnd, elements, swapFn);
  }

  /**
   * Sort the array.
   * @param compareFn - The comparison function
   */
  sort(compareFn: (a: T, b: T) => number): void {
    Utils._quickSort(this._elements, 0, this.length, compareFn);
  }

  /**
   * Garbage collection, clean up all cached elements.
   */
  garbageCollection(): void {
    this._elements.length = this.length;
  }

  private _startLoop(): void {
    ++this._loopCounter;
  }

  private _endLoop(swapFn: (e: T, idx: number) => void): void {
    if (--this._loopCounter !== 0) {
      return;
    }

    if (this._blankCount) {
      let from = 0;
      let to = this.length - 1;
      const elements = this._elements;
      partition: do {
        while (elements[from])
          if (++from >= to) {
            break partition;
          }

        while (!elements[to])
          if (from >= --to) {
            break partition;
          }

        const swapElement = elements[to];
        swapFn?.(swapElement, from);
        elements[from++] = swapElement;
        elements[to--] = null;
      } while (from < to);

      this.length -= this._blankCount;
      this._blankCount = 0;
    }
  }

  private _endLoopAndClean(preEnd: number, elements: T[], swapFn: (element: T, index: number) => void): void {
    if (--this._loopCounter !== 0) {
      return;
    }

    let index = 0;
    for (let i = preEnd, n = this.length; i < n; i++) {
      const element = elements[i];
      if (!element) continue;
      elements[index] = element;
      swapFn?.(element, index);
      index++;
    }
    this.length = index;
    this._blankCount = 0;
  }
}
