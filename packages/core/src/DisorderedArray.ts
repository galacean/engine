/**
 * High-performance unordered array, delete uses exchange method to improve performance, internal capacity only increases.
 */
export class DisorderedArray<T> {
  _elements: T[];

  length: number = 0;

  constructor(count: number = 0) {
    this._elements = new Array<T>(count);
  }

  add(element: T): void {
    if (this.length === this._elements.length) this._elements.push(element);
    else this._elements[this.length] = element;
    this.length++;
  }

  delete(element: T): void {
    //TODO: It can be optimized for custom binary search and other algorithms, currently this._elements>=this.length wastes performance.
    const index = this._elements.indexOf(element);
    this.deleteByIndex(index);
  }
  /**
   *
   * @param index
   * @returns The replaced item is used to reset its index.
   */
  deleteByIndex(index: number): T {
    var elements: T[] = this._elements;
    let end: T = null;
    const lastIndex = this.length - 1;
    if (index !== lastIndex) {
      end = elements[lastIndex];
      elements[index] = end;
    }
    this.length--;
    return end;
  }

  garbageCollection(): void {
    this._elements.length = this.length;
  }
}
