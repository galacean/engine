import { CloneMode, registerDefaultCloneMode } from "../clone/CloneDecorators";
import { Utils } from "../Utils";

/**
 * High-performance unordered array, delete uses exchange method to improve performance, internal capacity only increases.
 */
export class DisorderedArray<T> {
  /** The length of the array. */
  length = 0;

  /** @internal */
  _elements: T[];

  private _loopCounter = 0;
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
  deleteByIndex(index: number): T | undefined {
    const elements = this._elements;
    let end: T | undefined;
    if (this._loopCounter > 0) {
      this._elements[index] = null!;
      this._blankCount++;
    } else {
      const endIndex = this.length - 1;
      if (index !== endIndex) {
        end = elements[endIndex];
        elements[index] = end;
      }
      elements[endIndex] = null!;
      this.length--;
    }

    return end;
  }

  /**
   * Visits the entries present when iteration begins, skipping entries deleted by callbacks.
   * @param callbackFn - Called for each remaining entry
   * @param swapFn - Receives each element moved during compaction after the outermost iteration ends
   */
  forEach(callbackFn: (element: T, index: number) => void, swapFn?: (element: T, index: number) => void): void {
    this._startLoop();
    try {
      const elements = this._elements;
      for (let i = 0, n = this.length; i < n; i++) {
        const element = elements[i];
        element && callbackFn(element, i);
      }
    } finally {
      this._endLoop(swapFn);
    }
  }

  /**
   * Visits the initial entries and removes the visited entries when this is the outermost iteration.
   * @param callbackFn - Called for each remaining entry
   * @param swapFn - Receives retained elements and their new indices during compaction
   */
  forEachAndClean(callbackFn: (element: T, index: number) => void, swapFn?: (element: T, index: number) => void): void {
    this._startLoop();
    const preEnd = this.length;
    const elements = this._elements;
    let next = 0;
    try {
      while (next < preEnd) {
        const i = next++;
        const element = elements[i];
        element && callbackFn(element, i);
      }
    } finally {
      this._endLoopAndClean(next, elements, swapFn);
    }
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

  /**
   * Defers compaction so removals cannot shift indices during iteration.
   * @internal
   */
  _startLoop(): void {
    ++this._loopCounter;
  }

  /**
   * Compacts deferred removals when the outermost iteration ends.
   * @internal
   */
  _endLoop(swapFn: ((e: T, idx: number) => void) | undefined): void {
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
        elements[to--] = null!;
      } while (from < to);

      this.length -= this._blankCount;
      this._blankCount = 0;
    }
  }

  private _endLoopAndClean(
    preEnd: number,
    elements: T[],
    swapFn: ((element: T, index: number) => void) | undefined
  ): void {
    if (--this._loopCounter !== 0) {
      return;
    }

    let index = 0;
    for (let i = preEnd, n = this.length; i < n; i++) {
      const element = elements[i];
      if (!element) continue;
      elements[index] = element;
      elements[i] = null!;
      swapFn?.(element, index);
      index++;
    }
    this.length = index;
    this._blankCount = 0;
  }
}

registerDefaultCloneMode(DisorderedArray, CloneMode.Ignore);
