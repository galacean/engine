/**
 * High-performance unordered array, delete uses exchange method to improve performance, internal capacity only increases.
 */
export class DisorderedArray<T> {
  length = 0;

  _elements: T[];

  private _isLooping = false;
  private _blankCount = 0;

  constructor(count: number = 0) {
    this._elements = new Array<T>(count);
  }

  add(element: T): void {
    if (this.length === this._elements.length) {
      this._elements.push(element);
    } else {
      this._elements[this.length] = element;
    }
    this.length++;
  }

  delete(element: T): void {
    // @todo: It can be optimized for custom binary search and other algorithms, currently this._elements>=this.length wastes performance.
    const index = this._elements.indexOf(element);
    this.deleteByIndex(index);
  }

  set(index: number, element: T): void {
    if (index >= this.length) {
      throw "Index is out of range.";
    }
    this._elements[index] = element;
  }

  get(index: number): T {
    if (index >= this.length) {
      throw "Index is out of range.";
    }
    return this._elements[index];
  }

  startLoop(): void {
    this._isLooping = true;
  }

  /**
   * Delete the element at the specified index.
   * @param index - The index of the element to be deleted
   * @returns The replaced item is used to reset its index
   */
  deleteByIndex(index: number): T {
    const elements = this._elements;
    let end: T;
    if (this._isLooping) {
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

  endLoop(): void {
    this._isLooping = false;

    if (this._blankCount) {
      const elements = this._elements;
      for (let i = 0, j = 0, n = this.length; i < n; i++) {
        const element = elements[i];
        if (element) {
          elements[j++] = element;
        }
      }
      this.length -= this._blankCount;
    }
  }

  endLoopAndClear(): void {
    this._isLooping = false;
    this.length = 0;
  }

  garbageCollection(): void {
    this._elements.length = this.length;
  }
}
